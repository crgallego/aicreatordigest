/**
 * AI Creator Digest — sends the Telegram approval card
 * https://aicreatordigest.com
 *
 * Called by Make once a draft has been analysed (see analyze-video.js for the
 * step before this one). Sends the video's thumbnail with a condensed summary
 * caption, a button that opens the Mini App editor, and a shortcut pair for
 * publishing as-is or rejecting outright.
 *
 * Records the chat/message ids onto the stored draft so whichever surface
 * resolves it later — the Mini App editor or a card button — can clear the
 * card and leave a history line in its place.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN   from @BotFather                       (required)
 *   TELEGRAM_CHAT_ID     numeric chat id to send drafts to      (required)
 *   MAKE_WEBHOOK_SECRET  same shared secret as the other functions (optional, recommended)
 */

import { getStore } from "@netlify/blobs";
import { sendPhoto, escapeTelegramHtml } from "./lib/telegram.js";
import { header, parseRequestBody, json, respond, siteUrl } from "./lib/pipeline.js";
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

  for (const key of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    if (!process.env[key]) {
      return json(500, { error: `Server is missing the ${key} environment variable` });
    }
  }

  try {
    const store = getStore(DRAFTS_STORE);
    const draft = await store.get(draftKey, { type: "json" });
    if (!draft) {
      return json(404, { error: `No stored draft found for ${draftKey}. It may have already been published or rejected.` });
    }

    const title = escapeTelegramHtml(payload.title || draft.meta.videoTitle);
    const creatorName = escapeTelegramHtml(payload.creatorName || draft.shaped.creatorName || draft.meta.channelName);
    const playlistName = escapeTelegramHtml(payload.playlistName || draft.meta.playlistName);
    const takeaway = escapeTelegramHtml(payload.keyTakeaway || draft.shaped.keyTakeaway);
    const categories = (payload.categories || draft.shaped.categories || []).join(", ");
    const readTime = payload.readTimeMinutes || draft.shaped.readTimeMinutes || 1;

    const caption = [
      `<b>${title}</b>`,
      `${creatorName} · ${playlistName}`,
      "",
      `<i>${takeaway}</i>`,
      "",
      categories ? `Topics: ${escapeTelegramHtml(categories)}` : "",
      `~${readTime} min read`,
    ]
      .filter(Boolean)
      .join("\n");

    // "Review & edit" opens the Mini App: a full editor with a live preview of
    // the real page, right inside Telegram. The second row is the shortcut for
    // drafts that need no changes — it publishes exactly what's stored, so it
    // always reflects the editor's most recent save.
    const buttons = [
      [{ text: "📝 Review & edit", web_app: { url: `${siteUrl()}/review/${draftKey}` } }],
      [
        { text: "✅ Publish as-is", callback_data: `approve:${draftKey}` },
        { text: "❌ Reject", callback_data: `reject:${draftKey}` },
      ],
    ];

    const thumbnailUrl = `https://i.ytimg.com/vi/${draft.meta.videoId}/hqdefault.jpg`;
    const messageId = await sendPhoto(process.env.TELEGRAM_CHAT_ID, thumbnailUrl, caption, { buttons });

    // Recorded so whichever surface resolves this draft — the Mini App or a
    // card button — can clear the card and leave the history line behind.
    draft.chatId = process.env.TELEGRAM_CHAT_ID;
    draft.messageId = messageId;
    await store.setJSON(draftKey, draft);

    return json(200, { ok: true, draftKey, messageId });
  } catch (err) {
    console.error("notify-draft failed:", err);
    return json(err.statusCode || 500, { ok: false, error: err.message || "Unknown error" });
  }
};

// Netlify selects the v1 runtime whenever a `handler` export exists, and the v1
// runtime never receives the Blobs context. The export is named `run` so this file
// resolves as v2; tests call `run` directly. See lib/http-compat.js.
export default toV2(run);
