/**
 * AI Creator Digest — the analysis run, in one place
 *
 * Two callers need to perform an identical analysis: analyze-video-background,
 * when you tap Process, and watchdog-background, when it recovers a video whose
 * analysis was lost in transit. They must produce the same draft and the same
 * card, or a recovered digest would quietly differ from a normal one.
 *
 * So the whole tail of the work lives here rather than in either caller:
 *
 *   transcript → model → avatar and embeddability → draft → Telegram card
 *
 * Both callers are background functions, which is what makes this safe to run
 * inline: each gets 15 minutes rather than the 30 seconds a synchronous
 * function is allowed on this plan.
 */

import { getStore } from "@netlify/blobs";
import {
  normalizePayload,
  analyzeTranscript,
  shapeAnalysis,
  siteUrl,
} from "./pipeline.js";
import { sendCard, escapeTelegramHtml } from "./telegram.js";
import { fetchChannelAvatar, fetchVideoEmbeddable } from "./youtube.js";

export const DRAFTS_STORE = "aicd-drafts";

/**
 * Analyses a video and leaves a reviewable draft plus a Telegram card behind.
 *
 * Returns { draftKey, shaped, run, tookMs, messageId, delivered }. A failure to
 * deliver the card is reported in the return value rather than thrown, because
 * once the draft is stored the work is not lost and the caller should say so
 * differently than it would for an analysis that failed outright.
 *
 * @param {object}  payload  the video metadata, as Make sends it
 * @param {string}  model    xAI model id
 * @param {string}  [note]   optional line shown at the top of the card
 */
export async function runAnalysis({ payload, model, note = "" }) {
  const startedAt = Date.now();
  let meta = normalizePayload(payload);

  // Fetched here rather than upstream: the caption segments carry the timing
  // that makes clickable timestamps possible, and they are far too bulky to
  // pass through a form-encoded webhook body.
  if (!meta.transcript) {
    const res = await fetch(
      `${siteUrl()}/.netlify/functions/fetch-transcript?videoId=${encodeURIComponent(meta.videoId)}`,
      { headers: { "x-webhook-secret": process.env.MAKE_WEBHOOK_SECRET || "" } }
    );
    const data = await res.json();
    if (!data.transcript) {
      throw new Error(data.error || `No transcript available for ${meta.videoId}`);
    }
    meta = normalizePayload({ ...payload, transcript: data.transcript, segments: data.segments });
    console.log(
      `Transcript via ${data.source}: ${data.transcript.length} chars, ${(data.segments || []).length} segments`
    );
  }

  const { analysis, run } = await analyzeTranscript(meta, { model });
  const shaped = shapeAnalysis(analysis, meta);

  // Resolved after the model call so a lookup failure cannot waste an analysis.
  const [avatar, embeddable] = await Promise.all([
    fetchChannelAvatar(meta.channelUrl),
    fetchVideoEmbeddable(meta.videoId),
  ]);
  if (avatar) shaped.creatorImage = avatar.imageUrl;
  shaped.embeddable = embeddable;
  // Logged because both are silent when they fail: a missing avatar and a
  // refused embed look identical to an unset API key from the outside.
  console.log(`YouTube lookups: avatar=${avatar ? "found" : "none"} embeddable=${embeddable}`);

  const draftKey = meta.videoId;
  const store = getStore(DRAFTS_STORE);
  const tookMs = Date.now() - startedAt;

  await store.setJSON(draftKey, {
    meta,
    shaped,
    model, // recorded so a published digest can be traced to the model that wrote it
    run,   // model, duration and token usage, published with the digest
    createdAt: new Date().toISOString(),
  });

  // The draft is safe from here on. A failure past this point is a delivery
  // problem, not an analysis one, and the two are worth telling apart.
  try {
    const messageId = await sendDraftCard({ draftKey, meta, shaped, model, tookMs, note });
    const stored = await store.get(draftKey, { type: "json" });
    stored.chatId = process.env.TELEGRAM_CHAT_ID;
    stored.messageId = messageId;
    await store.setJSON(draftKey, stored);
    console.log(`Draft ready for ${draftKey} in ${tookMs}ms`);
    return { draftKey, shaped, run, tookMs, messageId, delivered: true };
  } catch (deliveryErr) {
    console.error("Draft stored but the card could not be delivered:", deliveryErr);
    return { draftKey, shaped, run, tookMs, messageId: null, delivered: false, deliveryErr };
  }
}

/** The review card: thumbnail, the takeaway, and the three things you can do. */
export async function sendDraftCard({ draftKey, meta, shaped, model, tookMs, note = "" }) {
  const caption = [
    note ? `<i>${escapeTelegramHtml(note)}</i>` : "",
    note ? "" : "",
    `<b>${escapeTelegramHtml(meta.videoTitle)}</b>`,
    `${escapeTelegramHtml(shaped.creatorName || meta.channelName)} · ${escapeTelegramHtml(meta.playlistName)}`,
    "",
    `<i>${escapeTelegramHtml(shaped.keyTakeaway)}</i>`,
    "",
    (shaped.categories || []).length
      ? `Topics: ${escapeTelegramHtml(shaped.categories.join(", "))}`
      : "",
    `~${shaped.readTimeMinutes || 1} min read · ${model} · ${(tookMs / 1000).toFixed(1)}s`,
  ]
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n");

  const buttons = [
    [{ text: "📝 Review & edit", web_app: { url: `${siteUrl()}/review/${draftKey}` } }],
    [
      { text: "✅ Publish as-is", callback_data: `approve:${draftKey}` },
      { text: "❌ Reject", callback_data: `reject:${draftKey}` },
    ],
  ];

  return sendCard(
    process.env.TELEGRAM_CHAT_ID,
    `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`,
    caption,
    { buttons }
  );
}
