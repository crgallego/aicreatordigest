/**
 * AI Creator Digest — reject a pending draft
 * https://aicreatordigest.com
 *
 * Called by Make's publish scenario when you tap Reject in Telegram. Deletes
 * the stored draft (nothing was ever committed to GitHub, so there's nothing
 * else to undo) and updates the Telegram message to reflect the decision.
 *
 * Environment variables: TELEGRAM_BOT_TOKEN, MAKE_WEBHOOK_SECRET (optional).
 */

import { getStore } from "@netlify/blobs";
import { header, parseRequestBody, json, respond } from "./lib/pipeline.js";
import { editMessageText } from "./lib/telegram.js";

const DRAFTS_STORE = "aicd-drafts";

export const handler = async (event) => {
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

    const chatId = payload.chatId;
    const messageId = payload.messageId;
    if (chatId && messageId) {
      try {
        await editMessageText(
          chatId,
          messageId,
          `❌ <b>Rejected:</b> ${draft?.meta?.videoTitle || draftKey}`
        );
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
