/**
 * Adapts an event-style handler to Netlify's v2 Functions API.
 *
 * Why this exists: Netlify only injects NETLIFY_BLOBS_CONTEXT into functions
 * that use the v2 signature (a default export taking a Request). Functions
 * using the v1 `exports.handler` signature do not receive it, and every call
 * to getStore() fails with "The environment has not been configured to use
 * Netlify Blobs" even on a healthy deploy. Measured 2026-07-29 on identical
 * twin functions in the same deploy: v2 saw a 608 character context and a
 * working store, v1 saw nothing.
 *
 * Rather than rewrite six working functions against a new request API, each
 * one keeps its existing handler (which the test suite calls directly) and
 * adds `export default toV2(handler)`. The presence of a default export is
 * what selects the v2 runtime; the handler's own logic is untouched.
 */

/** Wraps an (event) => {statusCode, headers, body} handler as (Request) => Response. */
export function toV2(handler) {
  return async (req) => {
    const url = new URL(req.url);

    // v1 handlers read lower-cased header names, which is what Headers yields.
    const headers = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const event = {
      httpMethod: req.method,
      headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: hasBody ? await req.text() : undefined,
      rawUrl: req.url,
      path: url.pathname,
    };

    const result = await handler(event);
    return new Response(result.body ?? "", {
      status: result.statusCode ?? 200,
      headers: result.headers ?? {},
    });
  };
}
