/* Tests fetch-transcript.js's source chain: the vendor is preferred when a key
 * is present, the free library is the fallback, both normalise to one shape,
 * and a failure reports what every source actually said. No network. */
import assert from "node:assert";

process.env.MAKE_WEBHOOK_SECRET = "s3cret";

const MODULE = "../netlify/functions/fetch-transcript.js";

/* The free library is a real dependency, so it is stubbed at the module level
 * rather than over fetch. Each case installs its own behaviour. */
let freeLibraryBehaviour = () => {
  throw new Error("free library not configured for this case");
};

const { register } = await import("node:module");
register(
  `data:text/javascript,
   export async function resolve(spec, ctx, next) {
     if (spec === "youtube-caption-extractor") {
       return { url: "mock:caption-extractor", shortCircuit: true };
     }
     return next(spec, ctx);
   }
   export async function load(url, ctx, next) {
     if (url === "mock:caption-extractor") {
       return {
         format: "module",
         shortCircuit: true,
         source: 'export const getSubtitles = (...a) => globalThis.__freeLib(...a);',
       };
     }
     return next(url, ctx);
   }`,
  import.meta.url
);

globalThis.__freeLib = (...args) => freeLibraryBehaviour(...args);

const { handler } = await import(MODULE);

function req(videoId = "abc123", secret = "s3cret") {
  return {
    httpMethod: "GET",
    headers: secret ? { "x-webhook-secret": secret } : {},
    queryStringParameters: { videoId },
  };
}

function stubFetch(fn) {
  globalThis.fetch = fn;
}

/* ===================== auth ===================== */

let res = await handler(req("abc123", ""));
assert.equal(res.statusCode, 401, "missing secret must be rejected");
console.log("auth: OK — unauthenticated request refused");

/* ===================== vendor path preferred ===================== */

process.env.SUPADATA_API_KEY = "test-vendor-key";

let vendorCalls = 0;
stubFetch(async (url, opts) => {
  vendorCalls++;
  assert.ok(String(url).startsWith("https://api.supadata.ai/v1/transcript"), "vendor URL");
  assert.ok(String(url).includes(encodeURIComponent("https://www.youtube.com/watch?v=abc123")));
  assert.equal(opts.headers["x-api-key"], "test-vendor-key", "vendor auth header");
  return {
    ok: true,
    status: 200,
    json: async () => ({
      lang: "en",
      content: [
        { text: "First line.", offset: 0, duration: 1500 },
        { text: "Second line.", offset: 1500, duration: 2500 },
      ],
    }),
  };
});
freeLibraryBehaviour = () => {
  throw new Error("free library must not be called when the vendor succeeds");
};

res = await handler(req());
assert.equal(res.statusCode, 200, res.body);
let body = JSON.parse(res.body);
assert.equal(body.source, "supadata");
assert.equal(body.transcript, "First line. Second line.");
assert.equal(body.hasTranscript, true);
assert.equal(vendorCalls, 1, "vendor should be called exactly once");
// 1500ms + 2500ms = 4s, and millisecond offsets must become seconds.
assert.equal(body.videoDuration, "0:04", "duration derived from ms offsets");
assert.equal(body.segments[1].start, "1.5", "offsets normalise to seconds");
console.log("vendor: OK — preferred when keyed, ms offsets normalised, free source untouched");

/* ===================== fallback when the vendor fails ===================== */

stubFetch(async () => ({
  ok: false,
  status: 500,
  json: async () => ({ message: "vendor exploded" }),
}));
freeLibraryBehaviour = () => [
  { text: "Fallback line.", start: "0", dur: "3" },
];

res = await handler(req());
assert.equal(res.statusCode, 200, res.body);
body = JSON.parse(res.body);
assert.equal(body.source, "youtube-caption-extractor", "should fall through to the free source");
assert.equal(body.transcript, "Fallback line.");
console.log("fallback: OK — free source used when the vendor fails");

/* ===================== both fail: every reason reported ===================== */

stubFetch(async () => ({ ok: false, status: 429, json: async () => ({ message: "out of credits" }) }));
freeLibraryBehaviour = () => {
  throw new Error("LOGIN_REQUIRED - Sign in to confirm you're not a bot");
};

res = await handler(req());
assert.equal(res.statusCode, 502, res.body);
body = JSON.parse(res.body);
assert.equal(body.attempts.length, 2, "both sources should be reported");
assert.equal(body.attempts[0].source, "supadata");
assert.equal(body.attempts[0].reason, "vendor_limit_reached");
assert.equal(body.attempts[1].source, "youtube-caption-extractor");
assert.equal(body.attempts[1].reason, "bot_gated");
assert.ok(!body.hint, "no missing-key hint when the key is set");
console.log("failure: OK — every source's own reason surfaced in one response");

/* ===================== unavailable video short-circuits ===================== */

let freeCalled = false;
stubFetch(async () => ({ ok: false, status: 404, json: async () => ({ message: "no captions" }) }));
freeLibraryBehaviour = () => {
  freeCalled = true;
  return [];
};

res = await handler(req());
assert.equal(res.statusCode, 404, res.body);
body = JSON.parse(res.body);
assert.equal(body.reason, "video_not_accessible");
assert.equal(freeCalled, false, "a deleted video must not burn a second source");
console.log("unavailable: OK — short-circuits instead of trying every source");

/* ===================== no key: free source only, with a hint ===================== */

delete process.env.SUPADATA_API_KEY;
let vendorTouched = false;
stubFetch(async () => {
  vendorTouched = true;
  throw new Error("vendor must not be contacted without a key");
});
freeLibraryBehaviour = () => {
  throw new Error("LOGIN_REQUIRED - Sign in to confirm you're not a bot");
};

res = await handler(req());
assert.equal(res.statusCode, 502, res.body);
body = JSON.parse(res.body);
assert.equal(vendorTouched, false, "vendor must be skipped entirely without a key");
assert.equal(body.attempts.length, 1);
assert.ok(body.hint && body.hint.includes("SUPADATA_API_KEY"), "should say the key is missing");
console.log("no key: OK — vendor skipped, and the response says why it can't work in production");

/* ===================== empty transcript is not an error ===================== */

process.env.SUPADATA_API_KEY = "test-vendor-key";
stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ lang: "en", content: [] }) }));

res = await handler(req());
assert.equal(res.statusCode, 200, res.body);
body = JSON.parse(res.body);
assert.equal(body.hasTranscript, false);
assert.equal(body.transcript, "");
console.log("empty: OK — a video with no captions reports cleanly rather than failing");

console.log("\nALL TRANSCRIPT-SOURCE TESTS PASSED");
