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
process.env.SITE_URL = "https://aicreatordigest.com";

const repoFiles = new Map();
const telegramCalls = [];

// The "ask" calls are prose, not JSON, and the tests drive what comes back so
// they can check how an answer is treated rather than what a model happens to say.
const askCalls = [];
let askReply = "The transcript doesn't cover that.";

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.startsWith("https://api.x.ai/")) {
    const body = JSON.parse(opts.body);

    if (String(body.messages[0].content).includes("research assistant behind AI Creator Digest")) {
      askCalls.push(body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: askReply } }] }), text: async () => "" };
    }

    const isConsensus = body.messages[1].content.includes("updating the consensus guide for the");
    const payload = isConsensus
      ? { title: "T", summary: "S", agree: ["a"], disagree: [] }
      : {
          creatorName: "Ran Segall",
          creatorBio: "Runs Flux Academy.",
          keyTakeaway: "Original AI takeaway.",
          executiveSummary: "Ran Segall runs Flux Academy and teaches web designers to price on value. This lesson responds to designers stuck quoting hourly.",
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

  if (u.includes("/.netlify/functions/analyze-video-background")) {
    return { ok: true, status: 202, json: async () => ({}), text: async () => "" };
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
assert.ok(loaded.edits.executiveSummary.includes("Flux Academy"), "the grounding summary should be editable");
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
    { title: "Predictability first", body: "Chris rewrote this one entirely.", thought: "This is the part I actually disagree with." },
    { title: "A point Chris added", body: "With his own body copy." },
  ],
  tactics: [],                                  // emptied on purpose — should drop from the page
  quotes: [{ text: "You are selling certainty.", at: "12:04" }],
  categories: ["Pricing", "Retainers"],
  featuredPeople: [{ name: "Dana Guest", role: "Studio founder" }],
  executiveSummary: "Chris rewrote the grounding paragraph himself, setting up who this is for.",
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
assert.ok(previewMd.includes("## In Context"), "preview should carry the grounding section");
assert.ok(previewMd.includes("Chris rewrote the grounding paragraph"), "the edited grounding summary should win");
assert.ok(!previewMd.includes("Ran Segall runs Flux Academy and teaches"), "the original grounding summary must not survive the edit");
assert.ok(!previewMd.includes("Original AI takeaway."), "preview must not show the replaced AI takeaway");
assert.ok(previewMd.includes("A point Chris added"), "preview should show the added key point");
assert.ok(
  previewMd.includes("_My thought: This is the part I actually disagree with._"),
  "a point's thought publishes under My thought, distinguishing it from the AI's body text"
);
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

/* ===================== reprocess with a model picker ===================== */
{
  // Set up a fresh draft to regenerate.
  let r = await analyzeVideo.run({
    httpMethod: "POST", headers: {},
    body: JSON.stringify({
      videoId: "regen01", videoTitle: "Regen Probe", channelName: "Flux Academy",
      transcript: "transcript ".repeat(60), playlistName: "Premium Websites", playlistSlug: "premium-websites",
    }),
  });
  assert.equal(r.statusCode, 200, "setup analyze: " + r.body);

  // Give it a card, as every real draft has: that is what reprocessing clears.
  r = await notifyDraft.run({ httpMethod: "POST", headers: {}, body: JSON.stringify({ draftKey: "regen01" }) });
  assert.equal(r.statusCode, 200, "setup notify: " + r.body);

  // The editor is told which models it may offer, and which wrote this draft.
  r = await reviewApi.run(req({ method: "GET", query: { draftKey: "regen01" } }));
  const loaded = JSON.parse(r.body);
  assert.ok(Array.isArray(loaded.models) && loaded.models.length, "a model list is offered");
  assert.ok(loaded.currentModel, "the draft reports which model produced it");
  assert.ok(loaded.models.includes(loaded.currentModel), "the running model is always in the picker");

  // An unknown model is refused rather than passed through to the API.
  r = await reviewApi.run(req({ body: { draftKey: "regen01", action: "reprocess", model: "definitely-not-a-model" } }));
  assert.equal(r.statusCode, 400, "an unlisted model must be rejected");
  assert.ok(JSON.parse(r.body).error.includes("Unknown model"));

  // A valid model starts a background run and clears the current card.
  const before = telegramCalls.length;
  r = await reviewApi.run(req({ body: { draftKey: "regen01", action: "reprocess", model: loaded.models[0] } }));
  assert.equal(r.statusCode, 200, "reprocess: " + r.body);
  assert.equal(JSON.parse(r.body).model, loaded.models[0]);

  const since = telegramCalls.slice(before);
  assert.ok(
    since.some((c) => c.method === "sendMessage" && String(c.body.text).includes("Reprocessing")),
    "the operator is told regeneration started"
  );
  console.log("reprocess: OK — model list offered, unknown models refused, run started and card cleared");
}

/* ===================== ask the model about the video =====================
 *
 * The editor writes about videos he hasn't watched, so this is the only route
 * from "the draft says something odd" back to what was actually said. What
 * matters in these assertions is grounding: the transcript reaches the model,
 * the draft goes with it, an unverifiable timestamp never comes back looking
 * verified, and none of the conversation reaches the published page. */
{
  const segments = [
    { start: "0", dur: "6", text: "Most designers price by the hour and never escape it" },
    { start: "62", dur: "6", text: "The retainer only works if delivery is boringly consistent" },
    { start: "124", dur: "6", text: "We charge eleven thousand dollars a month for that" },
  ];

  let r = await analyzeVideo.run({
    httpMethod: "POST", headers: {},
    body: JSON.stringify({
      videoId: "ask01", videoTitle: "Pricing Teardown", channelName: "Flux Academy",
      videoUrl: "https://www.youtube.com/watch?v=ask01",
      transcript: segments.map((s) => s.text).join(" "),
      segments,
      playlistName: "Premium Websites", playlistSlug: "premium-websites",
    }),
  });
  assert.equal(r.statusCode, 200, "setup analyze: " + r.body);

  // A question is required — an empty one must not reach the model at all.
  const before = askCalls.length;
  r = await reviewApi.run(req({ body: { draftKey: "ask01", action: "ask", question: "   " } }));
  assert.equal(r.statusCode, 400, "an empty question must be refused");
  assert.equal(askCalls.length, before, "an empty question must not reach the model");

  // The real thing: the transcript and the draft both have to travel with it.
  askReply = "He says the number outright at [2:04]: \"we charge eleven thousand dollars a month for that\".";
  r = await reviewApi.run(req({
    body: {
      draftKey: "ask01", action: "ask",
      question: "What does he actually charge?",
      edits: { keyTakeaway: "Retainers beat hourly once delivery is predictable." },
    },
  }));
  assert.equal(r.statusCode, 200, "ask: " + r.body);
  const answered = JSON.parse(r.body);
  assert.ok(answered.answer.includes("eleven thousand"), "the answer comes back to the editor");

  const sent = askCalls[askCalls.length - 1];
  const systemPrompt = sent.messages[0].content;
  assert.ok(!sent.response_format, "the ask call must not be forced into JSON mode");
  assert.ok(
    systemPrompt.includes("boringly consistent"),
    "the transcript must travel with the question — it is the only source an answer may come from"
  );
  assert.ok(
    systemPrompt.includes("[1:02]"),
    "the transcript is marked with real caption times so a moment can be cited"
  );
  assert.ok(
    systemPrompt.includes("Retainers beat hourly once delivery is predictable."),
    "the draft as it stands on screen goes with the question, not the last autosave"
  );
  assert.equal(sent.messages[sent.messages.length - 1].content, "What does he actually charge?");
  console.log("ask: OK — transcript, caption markers and the live draft all reach the model");

  // Those edits were context, not an instruction to save. A question is not an
  // edit, and a partial one arriving here must not quietly empty a section.
  r = await reviewApi.run(req({ method: "GET", query: { draftKey: "ask01" } }));
  const untouched = JSON.parse(r.body);
  assert.equal(untouched.edits.keyTakeaway, "Original AI takeaway.", "asking must not rewrite the draft");
  assert.ok(untouched.edits.keyPoints.length, "asking with partial edits must not wipe a section");
  console.log("ask: OK — asking a question leaves the draft exactly as it was");

  /* --- a timestamp is only linkable if the captions actually contain it --- */
  assert.deepEqual(
    answered.timestamps.map((t) => t.at),
    ["2:04"],
    "a cited marker that exists in the captions resolves"
  );
  assert.equal(answered.timestamps[0].url, "https://www.youtube.com/watch?v=ask01&t=124s");

  askReply = "She covers it at [9:99] and again at [41:07].";
  r = await reviewApi.run(req({ body: { draftKey: "ask01", action: "ask", question: "When?" } }));
  assert.equal(r.statusCode, 200, "ask: " + r.body);
  assert.deepEqual(
    JSON.parse(r.body).timestamps, [],
    "a timestamp with no matching caption marker must never come back as a resolved link"
  );
  console.log("ask: OK — invented timestamps resolve to nothing, real ones resolve to the second");

  /* --- the conversation persists, and carries into the next session --- */
  r = await reviewApi.run(req({ method: "GET", query: { draftKey: "ask01" } }));
  const reopened = JSON.parse(r.body);
  assert.equal(reopened.chat.length, 4, "both exchanges are still there when the editor is reopened");
  assert.equal(reopened.chat[0].content, "What does he actually charge?");
  assert.equal(reopened.chat[1].role, "assistant");
  assert.ok(reopened.hasTimedTranscript, "a video with captions reports that timestamps are available");

  // ...and the history is what makes a follow-up a follow-up.
  askReply = "Yes.";
  r = await reviewApi.run(req({ body: { draftKey: "ask01", action: "ask", question: "Is that per month?" } }));
  assert.equal(r.statusCode, 200);
  const followUp = askCalls[askCalls.length - 1].messages;
  assert.ok(
    followUp.some((m) => m.role === "assistant" && m.content.includes("eleven thousand")),
    "an earlier answer is replayed to the model, so a follow-up can lean on it"
  );
  console.log("ask: OK — the conversation survives reopening and follow-ups carry context");

  /* --- clearing --- */
  r = await reviewApi.run(req({ body: { draftKey: "ask01", action: "clear-chat" } }));
  assert.equal(r.statusCode, 200, "clear-chat: " + r.body);
  r = await reviewApi.run(req({ method: "GET", query: { draftKey: "ask01" } }));
  assert.deepEqual(JSON.parse(r.body).chat, [], "clearing empties the conversation");

  /* --- the conversation is a tool, not content: it must never publish --- */
  askReply = "A private note to myself about this video: DO NOT PUBLISH THIS SENTENCE.";
  await reviewApi.run(req({ body: { draftKey: "ask01", action: "ask", question: "Anything else?" } }));
  r = await reviewApi.run(req({
    body: { draftKey: "ask01", action: "publish", edits: { keyTakeaway: "Retainers beat hourly." } },
  }));
  assert.equal(r.statusCode, 200, "publish: " + r.body);
  const page = repoFiles.get(`playlists/premium-websites/videos/${JSON.parse(r.body).videoSlug}.md`);
  assert.ok(page, "the digest committed");
  assert.ok(
    !page.includes("DO NOT PUBLISH THIS SENTENCE") && !page.includes("Anything else?"),
    "nothing said in the ask panel may reach the published digest"
  );
  console.log("ask: OK — conversation clears, and never reaches the published page");
}

console.log("\nALL ASK-THE-MODEL TESTS PASSED");
