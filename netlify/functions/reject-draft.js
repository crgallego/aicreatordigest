/**
 * AI Creator Digest — reject a pending draft
 * https://aicreatordigest.com
 *
 * Called by Make when you tap Reject on a draft card. Deletes the stored
 * draft (nothing was ever committed to GitHub, so there's nothing else to
 * undo), removes the card, and leaves a one-line history record in its place.
 * The Mini App editor has its own reject path in review-api.js.
 *
 * Environment variables: TELEGRAM_BOT_TOKEN, MAKE_WEBHOOK_SECRET (optional).
 */

import { getStore } from "@netlify/blobs";
import { header, parseRequestBody, json, respond } from "./lib/pipeline.js";
import { deleteMessage, sendMessage } from "./lib/telegram.js";
import { toV2 } from "./lib/http-compat.js";

const DRAFTS_STORE = "aicd-drafts";

export const run = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, "");
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided = header(event, "x-webhook-secret") || header(event, "x-make-secret") || "";
    if (provided !== secret) {
      return json(401, { error: "Unauthorized" });
    }
  }

  let payload;
  try {
    payload = parseRequestBody(event);
  } catch {
    return json(400, { error: "Body is not valid JSON" });
  }

  const draftKey = String(payload.draftKey || "").trim();
  if (!draftKey) {
    return json(400, { error: "Missing required field: draftKey" });
  }

  try {
    const store = getStore(DRAFTS_STORE);
    const draft = await store.get(draftKey, { type: "json" });
    await store.delete(draftKey);

    const chatId = payload.chatId || draft?.chatId;
    const messageId = payload.messageId || draft?.messageId;
    if (chatId && messageId) {
      try {
        await deleteMessage(chatId, messageId);
        const lines = [`❌ <b>Rejected:</b> ${draft?.meta?.videoTitle || draftKey}`, draft?.meta?.channelName].filter(
          Boolean
        );
        await sendMessage(chatId, lines.join("\n"));
      } catch (err) {
        console.error("Telegram confirmation failed:", err.message);
      }
    }

    return json(200, { ok: true, draftKey, existed: Boolean(draft) });
  } catch (err) {
    console.error("reject-draft failed:", err);
    return json(err.statusCode || 500, { ok: false, error: err.message || "Unknown error" });
  }
};

// Netlify selects the v1 runtime whenever a `handler` export exists, and the v1
// runtime never receives the Blobs context. The export is named `run` so this file
// resolves as v2; tests call `run` directly. See lib/http-compat.js.
export default toV2(run);
