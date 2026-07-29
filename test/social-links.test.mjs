/* Tests the featured-people / social-links feature: links only ever come
 * from the video's own description text, never from AI guesswork, and are
 * correctly re-derived when the human edits the featured-people list in the
 * Mini App editor. */
import assert from "node:assert";
import crypto from "node:crypto";

process.env.XAI_API_KEY = "test-key";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "crgallego/aicreatordigest";
process.env.GITHUB_BRANCH = "main";
process.env.MAKE_WEBHOOK_SECRET = "s3cret";
process.env.TELEGRAM_BOT_TOKEN = "123:testbottoken";
process.env.TELEGRAM_CHAT_ID = "1000000000";

const repoFiles = new Map();

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);

  if (u.startsWith("https://api.x.ai/")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                creatorName: "Ran Segall",
                creatorBio: "Runs Flux Academy.",
                keyTakeaway: "Interview takeaway.",
                keyPoints: [{ title: "Point one", body: "Body one." }],
                tactics: [],
                quotes: [],
                categories: ["Interviews"],
                summary: "An interview episode.",
                seoDescription: "Interview digest.",
                // The AI names a guest but supplies no handle — that's the point.
                featuredPeople: [{ name: "Jane Guest", role: "guest" }],
              }),
            },
          },
        ],
      }),
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
    if (method === "sendMessage") return { ok: true, json: async () => ({ ok: true, result: { message_id: 555 } }) };
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  }

  throw new Error("Unexpected fetch: " + u);
};

const analyzeVideo = await import("../netlify/functions/analyze-video.js");
const reviewApi = await import("../netlify/functions/review-api.js");
const pipeline = await import("../netlify/functions/lib/pipeline.js");

/** Correctly-signed Telegram initData for the configured owner. */
function ownerInitData() {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 1000000000, first_name: "Chris" }),
  };
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update("123:testbottoken").digest();
  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** A Mini App request, authenticated as the site owner. */
function appReq(body) {
  return {
    httpMethod: "POST",
    headers: { "content-type": "application/json", "x-telegram-initdata": ownerInitData() },
    queryStringParameters: {},
    body: JSON.stringify(body),
  };
}

function req({ body } = {}) {
  return { httpMethod: "POST", headers: { "x-webhook-secret": "s3cret" }, body: JSON.stringify(body) };
}

/* ===================== extractSocialLinks unit checks ===================== */

{
  const description = [
    "Great chat today!",
    "Follow me: https://twitter.com/ransegall",
    "My guest Jane Guest is on IG too: https://instagram.com/janeguest_real",
    "Also check my LinkedIn: https://linkedin.com/in/ransegall",
  ].join("\n");

  const { creatorLinks, personLinks } = pipeline.extractSocialLinks(description, ["Jane Guest"]);
  assert.equal(creatorLinks.length, 2, "the two lines with no name on them are the creator's, one per distinct platform");
  assert.ok(creatorLinks.some((l) => l.url.includes("ransegall") && l.platform === "X"));
  assert.ok(creatorLinks.some((l) => l.url.includes("ransegall") && l.platform === "LinkedIn"));
  assert.equal(personLinks["Jane Guest"].length, 1, "the line naming Jane Guest attaches to her, not the creator");
  assert.ok(personLinks["Jane Guest"][0].url.includes("janeguest_real"));
  console.log("extractSocialLinks: OK — name-adjacent links attach to the person, everything else to the creator");
}

{
  // No description at all: no links invented, no error.
  const { creatorLinks, personLinks } = pipeline.extractSocialLinks("", ["Anyone"]);
  assert.equal(creatorLinks.length, 0);
  assert.deepEqual(personLinks, {});
  console.log("extractSocialLinks: OK — empty description yields no links, never a guess");
}

/* ===================== full analyze -> publish flow ===================== */

const payload = {
  videoId: "interview1",
  videoUrl: "https://www.youtube.com/watch?v=interview1",
  videoTitle: "An Interview Episode",
  videoDescription: [
    "Big thanks to my guest!",
    "Me on X: https://x.com/ransegall",
    "Jane Guest's X: https://x.com/janeguest",
  ].join("\n"),
  channelName: "Flux Academy",
  transcript: "transcript text ".repeat(50),
  playlistId: "PL-xxxxx",
  playlistName: "Interviews",
  playlistSlug: "interviews",
};

let res = await analyzeVideo.handler(req({ body: payload }));
assert.equal(res.statusCode, 200, "analyze-video: " + res.body);

// Load the draft the way the editor does, and confirm the AI supplied a name
// and role but never a handle — the link came from the description instead.
res = await reviewApi.handler({
  httpMethod: "GET",
  headers: { "x-telegram-initdata": ownerInitData() },
  queryStringParameters: { draftKey: "interview1" },
});
assert.equal(res.statusCode, 200, "review-api GET: " + res.body);
const loaded = JSON.parse(res.body);
const jane = loaded.edits.featuredPeople.find((p) => p.name === "Jane Guest");
assert.ok(jane, "the AI-identified guest should be in the editable fields");
assert.equal(jane.role, "guest");
assert.ok(
  !JSON.stringify(loaded.edits.featuredPeople).includes("x.com"),
  "editable person fields must carry name and role only — never a handle the AI could have invented"
);
console.log("review-api: OK — featured person loads with name+role only, no handle in an editable field");

// Chris keeps Jane Guest and adds a second name the AI missed — someone who
// also happens to have a link in the original description.
res = await reviewApi.handler(
  appReq({
    draftKey: "interview1",
    action: "publish",
    edits: {
      keyTakeaway: "Interview takeaway.",
      keyPoints: [{ title: "Point one", body: "Body one." }],
      tactics: [],
      quotes: [],
      categories: ["Interviews"],
      featuredPeople: [
        { name: "Jane Guest", role: "guest" },
        { name: "Ran Segall", role: "host" },
      ],
      editorNote: "",
    },
  })
);
assert.equal(res.statusCode, 200, "review-api publish: " + res.body);

const videoMd = repoFiles.get("playlists/interviews/videos/an-interview-episode.md");
assert.ok(videoMd, "video markdown committed");
assert.ok(videoMd.includes("## Connect"), "Connect section rendered");
assert.ok(videoMd.includes("[X](https://x.com/ransegall)"), "creator's own X link rendered from description, not guessed");
assert.ok(videoMd.includes("Jane Guest") && videoMd.includes("[X](https://x.com/janeguest)"), "guest's real link re-derived from description at publish time");
assert.ok(!videoMd.includes("x.com/ransegall)  \n- **Ran Segall**"), "sanity: not garbled");
console.log("publish-video: OK — Connect section shows verified links only, re-derived fresh from the video's own description");

console.log("\nALL SOCIAL-LINKS TESTS PASSED");
