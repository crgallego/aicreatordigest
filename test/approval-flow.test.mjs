/* Tests the Telegram/Google-Docs approval flow: analyze-video -> notify-draft
 * -> (simulated doc edit) -> publish-video, and the reject-draft path.
 * Mocks xAI, GitHub, and Telegram over global fetch; Netlify Blobs is
 * intercepted via mock-loader.mjs redirecting to blobs-mock.mjs. */
import assert from "node:assert";

process.env.XAI_API_KEY = "test-key";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "crgallego/aicreatordigest";
process.env.GITHUB_BRANCH = "main";
process.env.MAKE_WEBHOOK_SECRET = "s3cret";
process.env.TELEGRAM_BOT_TOKEN = "123:testbottoken";
process.env.TELEGRAM_CHAT_ID = "1000000000";

const repoFiles = new Map();
const telegramCalls = [];
let xaiCallCount = 0;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.startsWith("https://api.x.ai/")) {
    xaiCallCount++;
    const body = JSON.parse(opts.body);
    const prompt = body.messages[1].content;
    const isConsensus = prompt.includes("updating the consensus guide for the");
    const payload = isConsensus
      ? {
          title: "Consensus Title",
          summary: "One creator so far, agreeing with themselves.",
          agree: ["Ran says X."],
          disagree: [],
        }
      : {
          creatorName: "Ran Segall",
          creatorBio: "Runs Flux Academy.",
          keyTakeaway: "Original AI takeaway.",
          keyPoints: [
            { title: "Original point one", body: "Original body one." },
            { title: "Original point two", body: "Original body two." },
          ],
          tactics: [{ kind: "pricing", title: "Original Tactic", body: "Original tactic body." }],
          quotes: [{ text: "Original quote.", at: "" }],
          categories: ["Pricing", "Sales"],
          summary: "Original summary.",
          seoDescription: "Original SEO description.",
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
        json: async () => ({ sha: "sha-" + path, content: Buffer.from(repoFiles.get(path), "utf8").toString("base64") }),
        text: async () => "",
      };
    }
    if (opts.method === "PUT") {
      const body = JSON.parse(opts.body);
      repoFiles.set(path, Buffer.from(body.content, "base64").toString("utf8"));
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }
  }

  if (u.startsWith("https://api.telegram.org/")) {
    const method = u.split("/").pop();
    const body = JSON.parse(opts.body);
    telegramCalls.push({ method, body });
    if (method === "sendMessage" || method === "sendPhoto") {
      return { ok: true, json: async () => ({ ok: true, result: { message_id: 555 } }) };
    }
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  }

  throw new Error("Unexpected fetch: " + u);
};

const analyzeVideo = await import("../netlify/functions/analyze-video.js");
const notifyDraft = await import("../netlify/functions/notify-draft.js");
const publishVideo = await import("../netlify/functions/publish-video.js");
const rejectDraft = await import("../netlify/functions/reject-draft.js");

function req({ method = "POST", secret = "s3cret", body, form = false } = {}) {
  const headers = secret ? { "x-webhook-secret": secret } : {};
  if (form) headers["content-type"] = "application/x-www-form-urlencoded";
  return {
    httpMethod: method,
    headers,
    body: !body ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  };
}

const payload = {
  videoId: "abc123",
  videoUrl: "https://www.youtube.com/watch?v=abc123",
  videoTitle: "How Some Web Designers Charge 100x More",
  channelName: "Flux Academy",
  channelUrl: "https://www.youtube.com/@FluxAcademy",
  transcript: "transcript text ".repeat(100),
  playlistId: "PL-xxxxx",
  playlistName: "Premium Websites",
  playlistSlug: "premium-websites",
};

/* ===================== analyze-video ===================== */

let res = await analyzeVideo.run(req({ secret: "" }));
assert.equal(res.statusCode, 401, "analyze-video: missing secret should 401");

res = await analyzeVideo.run(req({ body: { videoId: "x" } }));
assert.equal(res.statusCode, 400, "analyze-video: missing fields should 400");

res = await analyzeVideo.run(req({ body: payload }));
assert.equal(res.statusCode, 200, "analyze-video happy path: " + res.body);
const analyzeResult = JSON.parse(res.body);
assert.equal(analyzeResult.ok, true);
assert.equal(analyzeResult.draftKey, "abc123");
assert.equal(analyzeResult.creatorName, "Ran Segall");
assert.equal(analyzeResult.keyTakeaway, "Original AI takeaway.");
assert.ok(analyzeResult.readTimeMinutes >= 1);
console.log("analyze-video: OK — draft stored, summary returned for the card");

/* ===================== notify-draft ===================== */

res = await notifyDraft.run(req({ body: { draftKey: "does-not-exist" } }));
assert.equal(res.statusCode, 404, "notify-draft: unknown draft should 404");

res = await notifyDraft.run(
  req({
    body: {
      draftKey: "abc123",
      title: payload.videoTitle,
      creatorName: "Ran Segall",
    },
  })
);
assert.equal(res.statusCode, 200, "notify-draft happy path: " + res.body);
const notifyResult = JSON.parse(res.body);
assert.equal(notifyResult.messageId, 555);

const sendCall = telegramCalls.find((c) => c.method === "sendPhoto");
assert.ok(sendCall, "sendPhoto should have been called");
assert.equal(sendCall.body.chat_id, "1000000000");
assert.ok(sendCall.body.photo.includes("i.ytimg.com/vi/abc123"), "caption photo should be the video's YouTube thumbnail");
assert.ok(sendCall.body.caption.includes("How Some Web Designers"));

const keyboard = sendCall.body.reply_markup.inline_keyboard;
assert.ok(keyboard[0][0].web_app, "first button should open the Mini App editor");
assert.ok(
  keyboard[0][0].web_app.url.endsWith("/review/abc123"),
  "Mini App button should deep-link to this draft: " + keyboard[0][0].web_app.url
);
assert.ok(keyboard[0][0].web_app.url.startsWith("https://"), "Telegram only accepts https web_app URLs");
assert.equal(keyboard[1][0].callback_data, "approve:abc123");
assert.equal(keyboard[1][1].callback_data, "reject:abc123");
console.log("notify-draft: OK — card carries the Mini App button plus publish/reject shortcuts");

/* ===================== publish-video ("Publish as-is") ===================== */

// This is the card shortcut: no content travels with the request, so whatever
// the Mini App editor last saved to the draft is exactly what ships. Editing
// behaviour itself lives in test-review-app.mjs, which drives the editor.

res = await publishVideo.run(req({ body: { draftKey: "does-not-exist" } }));
assert.equal(res.statusCode, 404, "publish-video: unknown draft should 404");

res = await publishVideo.run(
  req({ body: { draftKey: "abc123", chatId: "1000000000", messageId: 555 } })
);
assert.equal(res.statusCode, 200, "publish-video happy path: " + res.body);
const publishResult = JSON.parse(res.body);
assert.equal(publishResult.ok, true);
assert.equal(publishResult.playlistSlug, "premium-websites");

const videoMd = repoFiles.get("playlists/premium-websites/videos/how-some-web-designers-charge-100x-more.md");
assert.ok(videoMd, "video markdown should be committed");
assert.ok(videoMd.includes("Original AI takeaway."), "the stored draft should publish verbatim");
assert.ok(videoMd.includes("Original point one"), "stored key points should publish");
assert.ok(videoMd.includes("Original Tactic"), "stored tactics should publish");
console.log("publish-video: OK — publishes the stored draft verbatim, no second interpretation");

// Confirms the actionable card was deleted and a plain confirmation sent in its place.
const deleteCall = telegramCalls.find((c) => c.method === "deleteMessage" && c.body.message_id === 555);
assert.ok(deleteCall, "should have deleted the draft-review card");
const publishConfirm = telegramCalls.find((c) => c.method === "sendMessage" && c.body.text.includes("Published"));
assert.ok(publishConfirm, "should have sent a plain publish confirmation");
assert.ok(publishConfirm.body.text.includes(publishResult.url));
assert.ok(publishConfirm.body.text.includes("Flux Academy"), "confirmation should include the channel name");

res = await publishVideo.run(req({ body: { draftKey: "abc123" } }));
assert.equal(res.statusCode, 404, "re-publishing the same draftKey after it's been consumed should 404");
console.log("publish-video: OK — draft deleted after publish, can't double-publish");

/* ===================== reject-draft ===================== */

// Set up a second draft to reject.
res = await analyzeVideo.run(
  req({ body: { ...payload, videoId: "def456", videoTitle: "A Second Video" } })
);
assert.equal(res.statusCode, 200);

res = await rejectDraft.run(req({ body: { draftKey: "def456", chatId: "1000000000", messageId: 999 } }));
assert.equal(res.statusCode, 200, "reject-draft happy path: " + res.body);
const rejectResult = JSON.parse(res.body);
assert.equal(rejectResult.existed, true);

const rejectDeleteCall = telegramCalls.find((c) => c.method === "deleteMessage" && c.body.message_id === 999);
assert.ok(rejectDeleteCall, "should have deleted the draft-review card on reject");
const rejectConfirm = telegramCalls.find((c) => c.method === "sendMessage" && c.body.text.includes("Rejected"));
assert.ok(rejectConfirm, "should have sent a plain rejection confirmation");
assert.ok(rejectConfirm.body.text.includes("A Second Video"));
assert.ok(rejectConfirm.body.text.includes("Flux Academy"), "confirmation should include the channel name");

res = await publishVideo.run(req({ body: { draftKey: "def456" } }));
assert.equal(res.statusCode, 404, "a rejected draft should no longer be publishable");
console.log("reject-draft: OK — draft discarded, nothing committed, can't be published afterward");

console.log("\nALL APPROVAL-FLOW TESTS PASSED");
console.log(`(${xaiCallCount} xAI calls, ${telegramCalls.length} Telegram calls, ${repoFiles.size} files committed)`);

/* ===================== form-urlencoded body (what Make actually sends) ===================== */

// Make's HTTP module uses x-www-form-urlencoded bodies for anything carrying
// free-form text (transcripts, titles, descriptions) to avoid hand-rolling
// JSON escaping in its mapper. Confirm that path survives characters a real
// video title actually contains: quotes, an em dash, an ampersand.
const trickyTitle = 'A "quoted" title — with a dash & an ampersand';
res = await analyzeVideo.run(
  req({
    body: {
      ...payload,
      videoId: "form789",
      videoTitle: trickyTitle,
      videoDescription: "Follow me: https://x.com/ransegall\nsecond line & more",
    },
    form: true,
  })
);
assert.equal(res.statusCode, 200, "analyze-video (form-urlencoded): " + res.body);
const formResult = JSON.parse(res.body);
assert.equal(formResult.draftKey, "form789");
assert.equal(formResult.title, trickyTitle, "the title should survive form encoding byte for byte");

res = await publishVideo.run(
  req({ body: { draftKey: "form789", chatId: "1000000000", messageId: 1 }, form: true })
);
assert.equal(res.statusCode, 200, "publish-video (form-urlencoded): " + res.body);
const formPublish = JSON.parse(res.body);

const formVideoMd = repoFiles.get(`playlists/premium-websites/videos/${formPublish.videoSlug}.md`);
assert.ok(formVideoMd, "the tricky-title video should have been committed");
assert.ok(formVideoMd.includes(trickyTitle), "the tricky title should survive into the published markdown");
assert.ok(
  formVideoMd.includes("https://x.com/ransegall"),
  "a link from a multi-line form-encoded description should still be extracted"
);
console.log("form-urlencoded body: OK — quotes, em dashes, ampersands and newlines survived intact");

console.log("\nALL APPROVAL-FLOW TESTS PASSED (including form-urlencoded path)");
