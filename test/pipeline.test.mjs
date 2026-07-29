/* End-to-end smoke test with mocked xAI + GitHub. */
import assert from "node:assert";

process.env.XAI_API_KEY = "test-key";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "crgallego/aicreatordigest";
process.env.GITHUB_BRANCH = "main";
process.env.MAKE_WEBHOOK_SECRET = "s3cret";

const repoFiles = new Map(); // path -> content
const xaiCalls = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.startsWith("https://api.x.ai/")) {
    const body = JSON.parse(opts.body);
    xaiCalls.push(body);
    const prompt = body.messages[1].content;
    const isConsensus = prompt.includes("updating the consensus guide for the");
    const payload = isConsensus
      ? {
          title: "How the Best Designers Charge Premium Prices",
          summary: "Four creators, one loud agreement: price the outcome, not the hours.",
          agree: [
            "Ran calls hourly billing a ceiling you build yourself — his minimum project fee went from $3,000 to $12,000 in eighteen months.",
            "Alex agrees the discovery call is where the sale actually happens, not the proposal.",
          ],
          disagree: prompt.includes('"videoUrl": "https://www.youtube.com/watch?v=def456"')
            ? ["Ran anchors fees to 10% of projected first-year revenue; Alex prefers a flat floor regardless of the client's numbers."]
            : [],
        }
      : {
          creatorName: "Ran Segall",
          creatorBio:
            "Ran Segall runs Flux Academy, where he teaches designers how to build a real business around their craft. He's direct about money, generous with numbers.",
          keyTakeaway: "Stop selling hours — sell the business outcome your design produces.",
          keyPoints: [
            {
              title: "Hourly billing caps your ceiling",
              body: 'Ran says "the price is a story you tell about value" — hourly billing puts a hard ceiling on what you can ever earn.',
            },
            {
              title: "Raised his floor to $12,000",
              body: "He raised his minimum project fee from $3,000 to $12,000 in eighteen months by refusing smaller scopes.",
            },
            {
              title: "The call is the sale",
              body: "By the time a proposal goes out, the client has already decided — the discovery call is doing the actual selling.",
            },
          ],
          tactics: [
            {
              kind: "pricing",
              title: "The Value Conversation",
              body: "A discovery call structured to surface the dollar value of the project: ask what the site is supposed to do, get them to name the revenue number, then anchor the fee to 10% of that number, with a $12,000 floor.",
            },
          ],
          quotes: [
            { text: "The price is a story you tell about value.", at: "" },
            {
              text: "You don't get paid for the hours. You get paid for the years you spent learning to do it in those hours.",
              at: "14:22",
            },
          ],
          categories: ["Pricing", "Sales", "Positioning"],
          summary:
            "Ran Segall breaks down how premium web designers price their work, with the exact numbers from his own studio.",
          seoDescription:
            "Ran Segall on pricing web design by outcome instead of hours — with his real numbers.",
        };

    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
      text: async () => "",
    };
  }

  if (u.startsWith("https://api.github.com/")) {
    const path = decodeURIComponent(u.split("/contents/")[1].split("?")[0]);

    if (!opts.method || opts.method === "GET") {
      if (!repoFiles.has(path)) {
        return { ok: false, status: 404, json: async () => ({}), text: async () => "Not Found" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: "sha-" + path,
          content: Buffer.from(repoFiles.get(path), "utf8").toString("base64"),
        }),
        text: async () => "",
      };
    }

    if (opts.method === "PUT") {
      const body = JSON.parse(opts.body);
      repoFiles.set(path, Buffer.from(body.content, "base64").toString("utf8"));
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }
  }

  throw new Error("Unexpected fetch: " + u);
};

const { handler } = await import("../netlify/functions/process-video.js");

const payload = {
  videoId: "abc123",
  videoUrl: "https://www.youtube.com/watch?v=abc123",
  videoTitle: "How Some Web Designers Charge 100x More",
  channelName: "Flux Academy",
  channelUrl: "https://www.youtube.com/@FluxAcademy",
  transcript: "So the thing nobody tells you about pricing is ".repeat(200),
  playlistId: "PL-xxxxx",
  playlistName: "Premium Websites",
  playlistSlug: "premium-websites",
};

// --- auth ---------------------------------------------------------------
let res = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify(payload) });
assert.equal(res.statusCode, 401, "missing secret should 401");

res = await handler({ httpMethod: "GET", headers: { "x-webhook-secret": "s3cret" }, body: "" });
assert.equal(res.statusCode, 405, "GET should 405");

res = await handler({
  httpMethod: "POST",
  headers: { "x-webhook-secret": "s3cret" },
  body: JSON.stringify({ videoId: "x" }),
});
assert.equal(res.statusCode, 400, "missing fields should 400");

// --- happy path ---------------------------------------------------------
res = await handler({
  httpMethod: "POST",
  headers: { "x-webhook-secret": "s3cret" },
  body: JSON.stringify(payload),
});
const out = JSON.parse(res.body);
assert.equal(res.statusCode, 200, "expected 200, got " + res.statusCode + " " + res.body);
assert.equal(out.ok, true);

console.log("Result:", JSON.stringify(out, null, 2));
console.log("\nxAI calls:", xaiCalls.length);
console.log("\nFiles written:");
[...repoFiles.keys()].sort().forEach((p) => console.log("  " + p));

const expected = [
  "playlists/premium-websites/videos/how-some-web-designers-charge-100x-more.md",
  "playlists/premium-websites/index.md",
  "creators/flux-academy.md",
  "web/data/index.json",
  "sitemap.xml",
];
expected.forEach((p) => assert.ok(repoFiles.has(p), "missing file: " + p));

const idx = JSON.parse(repoFiles.get("web/data/index.json"));
assert.equal(idx.videos.length, 1);
assert.equal(idx.videos[0].creatorName, "Ran Segall");
assert.ok(idx.videos[0].readTimeMinutes >= 1, "read time should be computed");
assert.ok(
  Array.isArray(idx.videos[0].keyPointTitles) && idx.videos[0].keyPointTitles.length === 3,
  "manifest should carry keyPoint titles only, not full bodies"
);
assert.ok(!("keyPoints" in idx.videos[0]), "manifest should not duplicate full keyPoints (bloat)");
assert.equal(idx.creators["flux-academy"].videoCount, 1);
assert.equal(idx.playlists["premium-websites"].videoCount, 1);
assert.equal(idx.playlists["premium-websites"].creatorCount, 1);
assert.ok(idx.playlists["premium-websites"].consensusSummary, "consensusSummary should be stored for homepage cells");

const playlistMdFirst = repoFiles.get("playlists/premium-websites/index.md");
assert.ok(
  !playlistMdFirst.includes("Open Disagreements"),
  "with only 1 video, there's nothing to genuinely disagree about — no fabricated disagreement"
);

// --- idempotency: reprocess the same video ------------------------------
const before = repoFiles.get("playlists/premium-websites/videos/how-some-web-designers-charge-100x-more.md");
res = await handler({
  httpMethod: "POST",
  headers: { "x-webhook-secret": "s3cret" },
  body: JSON.stringify(payload),
});
assert.equal(res.statusCode, 200);
const idx2 = JSON.parse(repoFiles.get("web/data/index.json"));
assert.equal(idx2.videos.length, 1, "reprocessing must not duplicate the entry");
assert.ok(before.includes("Ran Segall"), "video page should name the creator");

// --- a second video from a different creator in the same playlist -------
res = await handler({
  httpMethod: "POST",
  headers: { "x-webhook-secret": "s3cret" },
  body: JSON.stringify({
    ...payload,
    videoId: "def456",
    videoUrl: "https://www.youtube.com/watch?v=def456",
    videoTitle: "The Offer That Books 40 Calls A Month",
    channelName: "Alex Hormozi",
    channelUrl: "https://www.youtube.com/@AlexHormozi",
    videoDuration: "22:40",
  }),
});
assert.equal(res.statusCode, 200, res.body);
const idx3 = JSON.parse(repoFiles.get("web/data/index.json"));
assert.equal(idx3.videos.length, 2);
assert.equal(Object.keys(idx3.creators).length, 2);
assert.equal(idx3.playlists["premium-websites"].creatorCount, 2);

const secondVideo = idx3.videos.find((v) => v.videoId === "def456");
assert.equal(secondVideo.videoDuration, "22:40", "optional videoDuration should pass through");
const firstVideoNoDuration = idx3.videos.find((v) => v.videoId === "abc123");
assert.ok(!firstVideoNoDuration.videoDuration, "videos without a duration should not have one fabricated");

const playlistMdAfterSecond = repoFiles.get("playlists/premium-websites/index.md");
assert.ok(
  playlistMdAfterSecond.includes("Open Disagreements"),
  "with 2+ videos, a genuine disagreement should be reported"
);

// slug collision handling
res = await handler({
  httpMethod: "POST",
  headers: { "x-webhook-secret": "s3cret" },
  body: JSON.stringify({ ...payload, videoId: "zzz999" }),
});
assert.equal(res.statusCode, 200, res.body);
assert.ok(
  repoFiles.has("playlists/premium-websites/videos/how-some-web-designers-charge-100x-more-zzz999.md"),
  "duplicate titles should get a disambiguated slug"
);

console.log("\nsitemap.xml:\n" + repoFiles.get("sitemap.xml"));
console.log("\n--- video page ---\n" + before);
console.log("\n--- playlist index.md (head) ---\n" + repoFiles.get("playlists/premium-websites/index.md").slice(0, 1600));
console.log("\n--- creator page (head) ---\n" + repoFiles.get("creators/flux-academy.md").slice(0, 900));

console.log("\n\nALL PIPELINE TESTS PASSED");

// expose for the renderer test
const fs = await import("node:fs");
fs.writeFileSync(
  new URL("./helpers/fixtures.json", import.meta.url),
  JSON.stringify(Object.fromEntries(repoFiles), null, 2)
);
