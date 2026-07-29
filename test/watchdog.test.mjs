/* Tests the watchdog: the thing that notices when a video is processed and
 * then quietly produces nothing.
 *
 * The failure it exists for is real. On 2026-07-29 Make recorded a POST to
 * analyze-video-background as a successful operation and Netlify never
 * received it; the candidate had already been deleted, so the video was gone
 * with no card and no error. These tests pin the four outcomes that matter:
 * stay quiet when healthy, wait when it's early, recover when it's lost, and
 * complain exactly once when recovery fails too.
 *
 * The last one is the point of the whole thing — a watchdog that either cries
 * every fifteen minutes or stays silent on a real fault is worse than none. */
import assert from "node:assert";
import { getStore, __reset } from "./helpers/blobs-mock.mjs";

process.env.XAI_API_KEY = "test-key";
process.env.YOUTUBE_API_KEY = "yt-test-key";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "crgallego/aicreatordigest";
process.env.GITHUB_BRANCH = "main";
process.env.MAKE_WEBHOOK_SECRET = "s3cret";
process.env.TELEGRAM_BOT_TOKEN = "123:testbottoken";
process.env.TELEGRAM_CHAT_ID = "1000000000";
process.env.SITE_URL = "https://aicreatordigest.com";

const VIDEO_ID = "vid_lost_001";

let telegram = [];
let publishedIndex = { site: "AI Creator Digest", playlists: {}, creators: {}, videos: [] };
let youtubeReturns = {
  title: "The Lost Video",
  description: "A description.",
  channelId: "UCNjPtOCvMrKY5eLwr_-7eUg",
  channelTitle: "Test Creator",
};
let xaiCalls = 0;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => "" });

  if (u.includes("/.netlify/functions/fetch-transcript")) {
    return ok({
      ok: true,
      transcript: "A transcript long enough to analyse.",
      segments: [{ text: "A transcript long enough to analyse.", start: "0", dur: "5" }],
      source: "test",
    });
  }

  if (u.startsWith("https://api.x.ai/")) {
    xaiCalls++;
    return ok({
      choices: [
        {
          message: {
            content: JSON.stringify({
              creatorName: "Test Creator",
              creatorBio: "Bio.",
              keyTakeaway: "The takeaway.",
              executiveSummary: "Who, what, when, where, why, how.",
              keyPoints: [{ title: "Point", body: "Body." }],
              tactics: [],
              quotes: [],
              categories: ["Testing"],
              summary: "Summary.",
              seoDescription: "SEO.",
            }),
          },
        },
      ],
    });
  }

  if (u.startsWith("https://www.googleapis.com/youtube/v3/videos") && u.includes("part=snippet")) {
    return youtubeReturns
      ? ok({ items: [{ snippet: youtubeReturns }] })
      : { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  }
  if (u.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
    return ok({ items: [{ status: { embeddable: true } }] });
  }
  if (u.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
    return ok({ items: [{ snippet: { title: "Test Creator", thumbnails: { high: { url: "https://img/x.jpg" } } } }] });
  }

  if (u.startsWith("https://api.github.com/")) {
    return ok({
      sha: "sha-index",
      content: Buffer.from(JSON.stringify(publishedIndex), "utf8").toString("base64"),
    });
  }

  if (u.startsWith("https://api.telegram.org/")) {
    telegram.push({ url: u, body: opts.body ? JSON.parse(opts.body) : null });
    return ok({ ok: true, result: { message_id: 999 } });
  }

  throw new Error(`Unexpected fetch in test: ${u}`);
};

const { default: watchdog } = await import("../netlify/functions/watchdog-background.mjs");

function call(body) {
  return watchdog(
    new Request("https://example.com/.netlify/functions/watchdog-background", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": "s3cret" },
      body: JSON.stringify(body),
    })
  );
}

function reset() {
  __reset();
  telegram = [];
  xaiCalls = 0;
  publishedIndex = { site: "AI Creator Digest", playlists: {}, creators: {}, videos: [] };
  youtubeReturns = {
    title: "The Lost Video",
    description: "A description.",
    channelId: "UCNjPtOCvMrKY5eLwr_-7eUg",
    channelTitle: "Test Creator",
  };
}

const longAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const justNow = new Date().toISOString();

/* 1. The healthy case must be silent. */
reset();
await getStore("aicd-drafts").setJSON(VIDEO_ID, { meta: {}, shaped: {} });
await call({ videoId: VIDEO_ID, processedAt: longAgo });
assert.equal(telegram.length, 0, "a healthy video must not produce any message");
assert.equal(xaiCalls, 0, "a healthy video must not be re-analysed");

/* 2. Already published: the draft is gone by design, and that is fine. */
reset();
publishedIndex.videos = [{ videoId: VIDEO_ID, title: "Already live" }];
await call({ videoId: VIDEO_ID, processedAt: longAgo });
assert.equal(telegram.length, 0, "a published video must not be reported as lost");
assert.equal(xaiCalls, 0, "a published video must not be re-analysed");

/* 3. Inside the grace period: a slow run is not a lost one. */
reset();
await call({ videoId: VIDEO_ID, processedAt: justNow });
assert.equal(xaiCalls, 0, "must not race a run that may still be in flight");
assert.equal(telegram.length, 0, "must not report a video that is merely young");

/* 4. Genuinely lost: rebuild from YouTube and re-run, once. */
reset();
await call({ videoId: VIDEO_ID, processedAt: longAgo, playlistSlug: "codex-strategies" });
assert.equal(xaiCalls, 1, "a lost video must be re-analysed");
const draft = await getStore("aicd-drafts").get(VIDEO_ID, { type: "json" });
assert.ok(draft, "recovery must leave a reviewable draft behind");
assert.equal(draft.meta.videoTitle, "The Lost Video", "the title must come back from YouTube");
assert.equal(
  draft.meta.playlistName,
  "Codex Strategies",
  "an unpublished playlist's name is reconstructed from its slug"
);
assert.equal(
  draft.shaped.creatorImage,
  "https://img/x.jpg",
  "a recovered draft gets the same avatar treatment as a normal one"
);
const card = telegram.find((t) => t.url.includes("sendPhoto") || t.url.includes("sendMessage"));
assert.ok(card, "recovery must send a card");
assert.ok(
  JSON.stringify(card.body).includes("Recovered by the watchdog"),
  "a recovered card must say that it was recovered, not pose as a normal run"
);

/* 5. Recovery already used up: complain once, then stay quiet forever. */
reset();
await getStore("aicd-watchdog").setJSON(VIDEO_ID, {
  recoveries: 1,
  alerted: false,
  title: "The Lost Video",
});
await call({ videoId: VIDEO_ID, processedAt: longAgo });
const alerts = telegram.filter((t) => JSON.stringify(t.body).includes("Video lost"));
assert.equal(alerts.length, 1, "a genuinely lost video must be reported");
assert.equal(xaiCalls, 0, "must not keep re-analysing a video that already failed recovery");

telegram = [];
await call({ videoId: VIDEO_ID, processedAt: longAgo });
assert.equal(telegram.length, 0, "must not repeat the alert on every subsequent check");

/* 6. No metadata to rebuild from: say so rather than invent a title. */
reset();
youtubeReturns = null;
await call({ videoId: VIDEO_ID, processedAt: longAgo });
assert.equal(xaiCalls, 0, "must not analyse a video whose metadata could not be recovered");
assert.ok(
  telegram.some((t) => JSON.stringify(t.body).includes("Video lost")),
  "an unrecoverable video must still be reported"
);

console.log("watchdog: all assertions passed");
