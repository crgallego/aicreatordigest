/**
 * AI Creator Digest — look up a pending draft's Google Doc URL
 * https://aicreatordigest.com
 *
 * Called by Make's publish scenario right after a Telegram Approve/Reject
 * tap. The callback_data only carries the draftKey (Telegram's 64-byte
 * limit rules out also encoding the Doc ID there), so Make needs this
 * lookup to find the docUrl notify-draft.js already saved onto the draft.
 *
 * Environment variables: MAKE_WEBHOOK_SECRET (optional, recommended).
 */

import { getStore } from "@netlify/blobs";
import { header, json, respond } from "./lib/pipeline.js";

const DRAFTS_STORE = "aicd-drafts";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, "");
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided = header(event, "x-webhook-secret") || header(event, "x-make-secret") || "";
    if (provided !== secret) {
      return json(401, { error: "Unauthorized" });
    }
  }

  const draftKey = String(
    event.httpMethod === "GET"
      ? (event.queryStringParameters || {}).draftKey || ""
      : JSON.parse(event.body || "{}").draftKey || ""
  ).trim();

  if (!draftKey) {
    return json(400, { error: "Missing required field: draftKey" });
  }

  try {
    const store = getStore(DRAFTS_STORE);
    const draft = await store.get(draftKey, { type: "json" });
    if (!draft) {
      return json(404, { error: `No stored draft found for ${draftKey}.` });
    }

    const docUrl = draft.docUrl || "";
    const docIdMatch = docUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);

    return json(200, {
      ok: true,
      draftKey,
      docUrl,
      docId: docIdMatch ? docIdMatch[1] : "",
      title: draft.meta.videoTitle,
    });
  } catch (err) {
    console.error("get-draft failed:", err);
    return json(err.statusCode || 500, { ok: false, error: err.message || "Unknown error" });
  }
};
