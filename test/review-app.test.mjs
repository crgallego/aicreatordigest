/* Tests the Telegram Mini App review flow: analyze -> notify -> load in the
 * editor -> save edits -> preview -> publish. The load-bearing assertion is at
 * the end: the markdown the preview renders must be the same markdown that
 * gets committed, so "what you approved" and "what shipped" can't diverge. */
import assert from "node:assert";
import crypto from "node:crypto";

const BOT_TOKEN = "123:testbottoken";
process.env.XAI_API_KEY = "test-key";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "crgallego/aicreatordigest";
process.env.GITHUB_BRANCH = "main";
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_CHAT_ID = "1000000000";
process.env.SITE_URL = "https://remarkable-figolla-6d707e.netlify.app";

const repoFiles = new Map();
const telegramCalls = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.startsWith("https://api.x.ai/")) {
    const body = JSON.parse(opts.body);
    const isConsensus = body.messages[1].content.includes("updating the consensus guide for the");
    const payload = isConsensus
      ? { title: "T", summary: "S", agree: ["a"], disagree: [] }
      : {
          creatorName: "Ran Segall",
          creatorBio: "Runs Flux Academy.",
          keyTakeaway: "Original AI takeaway.",
          keyPoints: [{ title: "AI point", body: "AI body." }],
          tactics: [{ kind: "pricing", title: "AI Tactic", body: "AI tactic body." }],
          quotes: [{ text: "AI quote.", at: "" }],
          categories: ["Pricing"],
          featuredPeople: [{ name: "Dana Guest", role: "Founder" }],
          summary: "Original summary.",
          seoDescription: "Original SEO description.",
        };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }), text: async () => "" };
  }

  if (u.startsWith("https://api.github.com/")) {
    const path = decodeURIComponent(u.split("/contents/")[1].split("?")[0]);
    if (!opts.method || opts.method === "GET") {
      if (!repoFiles.has(path)) return { ok: false, status: 404, json: async () => ({}), text: async () => "Not Found" };
      return { ok: true, status: 200, json: async () => ({ sha: "sha-" + path, content: Buffer.from(repoFiles.get(path), "utf8").toString("base64") }), text: async () => "" };
    }
    if (opts.method === "PUT") {
      const body = JSON.parse(opts.body);
      repoFiles.set(path, Buffer.from(body.content, "base64").toString("utf8"));
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }
  }

  if (u.startsWith("https://api.telegram.org/")) {
    const method = u.split("/").pop();
    telegramCalls.push({ method, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 777 } }) };
  }

  throw new Error("Unexpected fetch: " + u);
};

const analyzeVideo = await import("../netlify/functions/analyze-video.js");
const notifyDraft = await import("../netlify/functions/notify-draft.js");
const reviewApi = await import("../netlify/functions/review-api.js");
const previewMarkdown = await import("../netlify/functions/preview-markdown.js");

/** Correctly-signed Telegram initData for the configured owner. */
function initDataFor(userId = 1000000000) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: "Chris" }) };
  const checkString = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const OWNER = initDataFor();

function req({ method = "POST", body, query, initData = OWNER } = {}) {
  return {
    httpMethod: method,
    headers: { "content-type": "application/json", ...(initData ? { "x-telegram-initdata": initData } : {}) },
    queryStringParameters: query || {},
    body: body ? JSON.stringify(body) : undefined,
  };
}

/* ===================== set up a draft ===================== */

let res = await analyzeVideo.run({
  httpMethod: "POST",
  headers: {},
  body: JSON.stringify({
    videoId: "mini01",
    videoUrl: "https://www.youtube.com/watch?v=mini01",
    videoTitle: "Designing For Retainers",
    channelName: "Flux Academy",
    channelUrl: "https://www.youtube.com/@FluxAcademy",
    videoDescription: "Follow Dana Guest here: https://x.com/danaguest\nMy own channel: https://instagram.com/fluxacademy",
    transcript: "transcript ".repeat(200),
    playlistId: "PL-x",
    playlistName: "Premium Websites",
    playlistSlug: "premium-websites",
  }),
});
assert.equal(res.statusCode, 200, "analyze: " + res.body);

res = await notifyDraft.run({ httpMethod: "POST", headers: {}, body: JSON.stringify({ draftKey: "mini01" }) });
assert.equal(res.statusCode, 200, "notify: " + res.body);
console.log("setup: OK — draft analysed and card sent");

/* ===================== auth boundary ===================== */

res = await reviewApi.run(req({ method: "GET", query: { draftKey: "mini01" }, initData: "" }));
assert.equal(res.statusCode, 401, "review-api must reject a request with no initData");

res = await reviewApi.run(req({ method: "GET", query: { draftKey: "mini01" }, initData: initDataFor(999888777) }));
assert.equal(res.statusCode, 403, "review-api must reject a valid signature from a non-owner");
console.log("review-api: OK — unauthenticated and non-owner requests refused");

/* ===================== load into the editor ===================== */

res = await reviewApi.run(req({ method: "GET", query: { draftKey: "mini01" } }));
assert.equal(res.statusCode, 200, "review-api GET: " + res.body);
const loaded = JSON.parse(res.body);
assert.equal(loaded.video.title, "Designing For Retainers");
assert.equal(loaded.edits.keyTakeaway, "Original AI takeaway.");
assert.ok(loaded.previewToken, "a preview token should come back with the draft");
assert.ok(
  loaded.derivedLinks.creatorLinks.some((l) => l.platform === "Instagram"),
  "creator's own link should be derived from the description"
);
assert.ok(
  loaded.derivedLinks.featuredPeople.some((p) => p.name === "Dana Guest" && p.links.some((l) => l.platform === "X")),
  "a featured person's link should attach to them, not the creator"
);
console.log("review-api: OK — draft loads with derived links split between creator and guest");

/* ===================== save edits ===================== */

const edits = {
  keyTakeaway: "Retainers beat project work once you can predict the workload.",
  keyPoints: [
    { title: "Predictability first", body: "Chris rewrote this one entirely." },
    { title: "A point Chris added", body: "With his own body copy." },
  ],
  tactics: [],                                  // emptied on purpose — should drop from the page
  quotes: [{ text: "You are selling certainty.", at: "12:04" }],
  categories: ["Pricing", "Retainers"],
  featuredPeople: [{ name: "Dana Guest", role: "Studio founder" }],
  editorNote: "Only works if your delivery is already boringly consistent.",
};

res = await reviewApi.run(req({ body: { draftKey: "mini01", action: "save", edits } }));
assert.equal(res.statusCode, 200, "review-api save: " + res.body);
const saved = JSON.parse(res.body);
assert.ok(saved.previewToken, "save should return a fresh preview token");
console.log("review-api: OK — edits saved");

/* ===================== preview ===================== */

res = await previewMarkdown.run({ httpMethod: "GET", headers: {}, queryStringParameters: { token: "bogus.123.deadbeef" } });
assert.equal(res.statusCode, 401, "preview-markdown must reject a forged token");

res = await previewMarkdown.run({ httpMethod: "GET", headers: {}, queryStringParameters: { token: saved.previewToken } });
assert.equal(res.statusCode, 200, "preview-markdown: " + res.body);
const previewMd = res.body;

assert.ok(previewMd.includes("Retainers beat project work"), "preview should show the edited takeaway");
assert.ok(!previewMd.includes("Original AI takeaway."), "preview must not show the replaced AI takeaway");
assert.ok(previewMd.includes("A point Chris added"), "preview should show the added key point");
assert.ok(!previewMd.includes("AI Tactic"), "an emptied section must not appear in the preview");
assert.ok(previewMd.includes("Studio founder"), "preview should carry the edited role");
assert.ok(previewMd.includes("Only works if your delivery"), "preview should include the editor's note");
assert.ok(
  previewMd.includes("_Chris Gallego's own take — not AI-generated._"),
  "the editor's note must stay explicitly attributed, never blended in with the AI summary"
);
assert.ok(previewMd.includes("https://x.com/danaguest"), "preview should carry the verified guest link");
assert.equal(res.headers["Cache-Control"], "no-store", "a preview must never be cached");
console.log("preview-markdown: OK — renders the saved edits, drops emptied sections");

/* ===================== publish ===================== */

res = await reviewApi.run(req({ body: { draftKey: "mini01", action: "publish", edits } }));
assert.equal(res.statusCode, 200, "review-api publish: " + res.body);
const published = JSON.parse(res.body);

const committed = repoFiles.get(`playlists/premium-websites/videos/${published.videoSlug}.md`);
assert.ok(committed, "the video markdown should have been committed");

/* --- the assertion this whole design exists to make true --- */
const bodyOf = (md) => md.split("\n---\n").slice(1).join("\n---\n");
assert.equal(
  bodyOf(committed),
  bodyOf(previewMd),
  "the published page body must be byte-identical to what the preview showed"
);
console.log("publish: OK — published markdown is byte-identical to the preview");

/* ===================== card cleanup ===================== */

const deleted = telegramCalls.find((c) => c.method === "deleteMessage" && c.body.message_id === 777);
assert.ok(deleted, "publishing from the Mini App should clear the card");
const historyLine = telegramCalls.find((c) => c.method === "sendMessage" && String(c.body.text).includes("Published"));
assert.ok(historyLine, "a history line should be left behind");
assert.ok(historyLine.body.text.includes("Designing For Retainers"));
assert.ok(historyLine.body.text.includes(published.url));
console.log("publish: OK — card cleared, history line left in the chat");

// The draft is consumed, so a second publish must not republish.
res = await reviewApi.run(req({ body: { draftKey: "mini01", action: "publish", edits } }));
assert.equal(res.statusCode, 404, "a published draft must not be publishable twice");

// ...and its preview token must stop resolving too.
res = await previewMarkdown.run({ httpMethod: "GET", headers: {}, queryStringParameters: { token: saved.previewToken } });
assert.equal(res.statusCode, 404, "preview of a consumed draft should 404");
console.log("publish: OK — draft consumed, no double-publish, preview retired");

console.log("\nALL REVIEW MINI APP TESTS PASSED");
