/**
 * AI Creator Digest — markdown for the review preview
 * https://aicreatordigest.com
 *
 * Serves a draft rendered exactly as publishVideo would commit it, so the
 * preview iframe can load the real /web/video.html against unpublished
 * content. The page doing the rendering is the public site's own template —
 * it knows nothing about Telegram, which is why this endpoint takes a
 * short-lived preview token rather than Mini App initData.
 *
 * Environment variables: TELEGRAM_BOT_TOKEN (the token-signing key).
 */

import { getStore } from "@netlify/blobs";
import { renderPreviewMarkdown, respond, json } from "./lib/pipeline.js";
import { verifyPreviewToken } from "./lib/webapp-auth.js";

const DRAFTS_STORE = "aicd-drafts";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, "");
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

  let draftKey;
  try {
    draftKey = verifyPreviewToken(event.queryStringParameters?.token);
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  try {
    const store = getStore(DRAFTS_STORE);
    const draft = await store.get(draftKey, { type: "json" });
    if (!draft) return json(404, { error: "That draft no longer exists." });

    const markdown = renderPreviewMarkdown({
      meta: draft.meta,
      shaped: draft.shaped,
      editorNote: draft.editorNote || "",
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        // A preview must never be cached — it changes on every save.
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
      body: markdown,
    };
  } catch (err) {
    console.error("preview-markdown failed:", err);
    return json(err.statusCode || 500, { error: err.message || "Unknown error" });
  }
};
