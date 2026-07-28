/**
 * AI Creator Digest — sends the Telegram approval card
 * https://aicreatordigest.com
 *
 * Called by Make right after it creates and shares the Google Doc for a
 * draft (see analyze-video.js for the step before this one). Sends a
 * condensed summary + a link to the Doc + Approve/Reject buttons.
 *
 * Also records docUrl onto the stored draft (Blobs) so the publish webhook
 * can find it later. Your editorial note lives inside the Doc itself (its
 * own EDITOR'S NOTE section) — there's no separate Telegram-side note flow.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN   from @BotFather                       (required)
 *   TELEGRAM_CHAT_ID     numeric chat id to send drafts to      (required)
 *   MAKE_WEBHOOK_SECRET  same shared secret as the other functions (optional, recommended)
 */

import { getStore } from "@netlify/blobs";
import { sendMessage, escapeTelegramHtml } from "./lib/telegram.js";
import { header, json, respond } from "./lib/pipeline.js";

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
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body is not valid JSON" });
  }

  const draftKey = String(payload.draftKey || "").trim();
  const docUrl = String(payload.docUrl || "").trim();
  if (!draftKey || !docUrl) {
    return json(400, { error: "Missing required field(s): draftKey, docUrl" });
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

    draft.docUrl = docUrl;
    await store.setJSON(draftKey, draft);

    const title = escapeTelegramHtml(payload.title || draft.meta.videoTitle);
    const creatorName = escapeTelegramHtml(payload.creatorName || draft.shaped.creatorName || draft.meta.channelName);
    const playlistName = escapeTelegramHtml(payload.playlistName || draft.meta.playlistName);
    const takeaway = escapeTelegramHtml(payload.keyTakeaway || draft.shaped.keyTakeaway);
    const categories = (payload.categories || draft.shaped.categories || []).join(", ");
    const readTime = payload.readTimeMinutes || draft.shaped.readTimeMinutes || 1;

    const text = [
      `<b>${title}</b>`,
      `${creatorName} · ${playlistName}`,
      "",
      `<i>${takeaway}</i>`,
      "",
      categories ? `Topics: ${escapeTelegramHtml(categories)}` : "",
      `~${readTime} min read`,
      "",
      `📝 <a href="${docUrl}">Review or edit the full draft</a>`,
      "",
      "Edit anything in the doc — including the Editor's Note section at the bottom for your own take — then tap Approve when ready.",
    ]
      .filter(Boolean)
      .join("\n");

    const buttons = [
      [
        { text: "✅ Approve & Publish", callback_data: `approve:${draftKey}` },
        { text: "❌ Reject", callback_data: `reject:${draftKey}` },
      ],
    ];

    const messageId = await sendMessage(process.env.TELEGRAM_CHAT_ID, text, { buttons });

    return json(200, { ok: true, draftKey, messageId });
  } catch (err) {
    console.error("notify-draft failed:", err);
    return json(err.statusCode || 500, { ok: false, error: err.message || "Unknown error" });
  }
};
