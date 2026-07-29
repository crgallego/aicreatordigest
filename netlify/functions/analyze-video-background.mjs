/**
 * AI Creator Digest — analysis phase, off the clock
 * https://aicreatordigest.com
 *
 * Same work as analyze-video.js, but as a Netlify background function, which
 * gets 15 minutes instead of the 30 seconds a synchronous function is allowed
 * on this plan. That ceiling is not theoretical: on 2026-07-29 a 6,500 token
 * transcript was killed mid-analysis at exactly 30000ms, before the draft was
 * written, which looked from the outside like a draft that vanished.
 *
 * Because a background function answers 202 immediately and its result is
 * never seen by the caller, this owns the whole tail of the analysis step:
 *
 *   analyse → store the draft → send the Telegram card
 *
 * Make therefore no longer calls notify-draft itself. It fires this and moves
 * on, and the card shows up when the work is genuinely done.
 *
 * A failure here would otherwise be silent, so failures send a Telegram
 * message naming the video and the reason. That message matters: Make has
 * already removed the candidate from the queue by the time this runs.
 *
 * Body accepts everything analyze-video.js accepts, plus:
 *   model   optional xAI model id, overriding XAI_MODEL for this run only
 *
 * Environment variables: XAI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 * MAKE_WEBHOOK_SECRET, SITE_URL.
 */

import { getStore } from "@netlify/blobs";
import {
  normalizePayload,
  analyzeTranscript,
  shapeAnalysis,
  defaultModel,
  clean,
} from "./lib/pipeline.js";
import { sendCard, sendMessage, escapeTelegramHtml } from "./lib/telegram.js";
import { fetchChannelAvatar, fetchVideoEmbeddable } from "./lib/youtube.js";
import { siteUrl } from "./lib/pipeline.js";

const DRAFTS_STORE = "aicd-drafts";

export default async (req) => {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret") || req.headers.get("x-make-secret") || "";
    if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("x-www-form-urlencoded")) {
      payload = Object.fromEntries(new URLSearchParams(await req.text()));
    } else {
      payload = await req.json();
    }
  } catch {
    return new Response("Body is not valid JSON", { status: 400 });
  }

  const missing = ["videoId", "videoTitle", "channelName"].filter(
    (k) => !String(payload[k] || "").trim()
  );
  if (missing.length) {
    return new Response(`Missing required field(s): ${missing.join(", ")}`, { status: 400 });
  }

  // Everything past this point runs after Netlify has already answered 202,
  // so nothing here can be reported back to Make. Failures go to Telegram.
  const model = clean(payload.model) || defaultModel();
  let meta = normalizePayload(payload);

  try {
    console.log(`Analyzing "${meta.videoTitle}" by ${meta.channelName} via ${model}`);
    const startedAt = Date.now();

    // Fetch the transcript here rather than upstream. Doing it inside this
    // function is what makes timestamps possible: the caption segments carry
    // the timing, and they are far too bulky to pass through a form-encoded
    // webhook body. It also means one vendor call instead of two.
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
      console.log(`Transcript via ${data.source}: ${data.transcript.length} chars, ${(data.segments || []).length} segments`);
    }

    const { analysis, run } = await analyzeTranscript(meta, { model });
    const shaped = shapeAnalysis(analysis, meta);

    // The creator's own channel avatar, or nothing. Resolved after the model
    // call so a lookup failure cannot waste an analysis.
    const [avatar, embeddable] = await Promise.all([
      fetchChannelAvatar(meta.channelUrl),
      fetchVideoEmbeddable(meta.videoId),
    ]);
    if (avatar) shaped.creatorImage = avatar.imageUrl;
    shaped.embeddable = embeddable;

    const draftKey = meta.videoId;
    const store = getStore(DRAFTS_STORE);
    await store.setJSON(draftKey, {
      meta,
      shaped,
      model, // recorded so a published digest can be traced to the model that wrote it
      run,   // model, duration and token usage, published with the digest
      createdAt: new Date().toISOString(),
    });

    // The draft is safe from here on. A failure past this point is a delivery
    // problem, not an analysis one, and the two are worth telling apart in the
    // message you receive.
    try {
      const messageId = await sendDraftCard(draftKey, meta, shaped, model, Date.now() - startedAt);
      const stored = await store.get(draftKey, { type: "json" });
      stored.chatId = process.env.TELEGRAM_CHAT_ID;
      stored.messageId = messageId;
      await store.setJSON(draftKey, stored);
      console.log(`Draft ready for ${draftKey} in ${Date.now() - startedAt}ms`);
    } catch (deliveryErr) {
      console.error("Draft stored but the card could not be delivered:", deliveryErr);
      await reportFailure(meta, model, deliveryErr, { draftStored: true });
    }
  } catch (err) {
    console.error("analyze-video-background failed:", err);
    await reportFailure(meta, model, err, { draftStored: false });
  }

  return new Response("", { status: 202 });
};

async function sendDraftCard(draftKey, meta, shaped, model, tookMs) {
  const caption = [
    `<b>${escapeTelegramHtml(meta.videoTitle)}</b>`,
    `${escapeTelegramHtml(shaped.creatorName || meta.channelName)} · ${escapeTelegramHtml(meta.playlistName)}`,
    "",
    `<i>${escapeTelegramHtml(shaped.keyTakeaway)}</i>`,
    "",
    (shaped.categories || []).length ? `Topics: ${escapeTelegramHtml(shaped.categories.join(", "))}` : "",
    `~${shaped.readTimeMinutes || 1} min read · ${model} · ${(tookMs / 1000).toFixed(1)}s`,
  ]
    .filter(Boolean)
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

/** A background failure is invisible unless it announces itself. */
async function reportFailure(meta, model, err, { draftStored }) {
  if (!process.env.TELEGRAM_CHAT_ID || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const tail = draftStored
      ? `The draft <b>was saved</b> and can still be published. Reopen it with draft id <code>${escapeTelegramHtml(meta.videoId)}</code>.`
      : `No draft was saved, and this video was already removed from the queue. Its id is <code>${escapeTelegramHtml(meta.videoId)}</code> if you want it restored.`;

    await sendMessage(
      process.env.TELEGRAM_CHAT_ID,
      [
        draftStored
          ? `⚠️ <b>Card not delivered:</b> ${escapeTelegramHtml(meta.videoTitle)}`
          : `⚠️ <b>Analysis failed:</b> ${escapeTelegramHtml(meta.videoTitle)}`,
        escapeTelegramHtml(meta.channelName),
        `model: ${escapeTelegramHtml(model)}`,
        "",
        escapeTelegramHtml(String(err.message || err).slice(0, 300)),
        "",
        tail,
      ].join("\n")
    );
  } catch (notifyErr) {
    console.error("Could not report the failure to Telegram:", notifyErr.message);
  }
}
