/* Tests fetch-transcript.js: auth, validation, error classification (pure,
 * no network), and one live end-to-end call against a real public video. */
import assert from "node:assert";

process.env.MAKE_WEBHOOK_SECRET = "s3cret";

const { handler } = await import(
  "../netlify/functions/fetch-transcript.js"
);

function req({ method = "GET", secret = "s3cret", query = {}, body } = {}) {
  return {
    httpMethod: method,
    headers: secret ? { "x-webhook-secret": secret } : {},
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : undefined,
  };
}

// --- auth / validation ---------------------------------------------------
let res = await handler(req({ secret: "" }));
assert.equal(res.statusCode, 401, "missing secret should 401");

res = await handler(req({ secret: "wrong" }));
assert.equal(res.statusCode, 401, "wrong secret should 401");

res = await handler(req({ method: "DELETE" }));
assert.equal(res.statusCode, 405, "unsupported method should 405");

res = await handler(req({ query: {} }));
assert.equal(res.statusCode, 400, "missing videoId should 400");
assert.ok(JSON.parse(res.body).error.includes("videoId"));

console.log("auth + validation: OK");

// --- POST body form works too --------------------------------------------
// (only checked for shape here; the live call below exercises GET)
res = await handler(req({ method: "POST", query: undefined, body: { videoId: "" } }));
assert.equal(res.statusCode, 400, "empty videoId in POST body should still 400");
console.log("POST body parsing: OK");

// --- live call against a real public video --------------------------------
const start = Date.now();
res = await handler(req({ query: { videoId: "jNQXAC9IVRw" } }));
const body = JSON.parse(res.body);

assert.equal(res.statusCode, 200, "expected 200, got " + res.statusCode + " " + res.body);
assert.equal(body.ok, true);
assert.equal(body.hasTranscript, true);
assert.ok(body.transcript.length > 10, "transcript should have real content");
assert.ok(Array.isArray(body.segments) && body.segments.length > 0);
assert.ok(body.videoDuration.match(/^\d{1,2}:\d{2}$/), "videoDuration should be M:SS or MM:SS, got " + body.videoDuration);
console.log(`live fetch: OK (${Date.now() - start}ms) — "${body.transcript.slice(0, 60)}..." duration=${body.videoDuration}`);

// --- a video ID that doesn't exist ----------------------------------------
res = await handler(req({ query: { videoId: "aaaaaaaaaaa" } }));
const badBody = JSON.parse(res.body);
console.log("nonexistent video ->", res.statusCode, badBody.reason, "-", badBody.error.slice(0, 80));
assert.ok(res.statusCode === 404 || res.statusCode === 502, "nonexistent video should be a clean 4xx/5xx, not crash");
assert.ok(badBody.ok === false);

console.log("\nALL FETCH-TRANSCRIPT TESTS PASSED");
