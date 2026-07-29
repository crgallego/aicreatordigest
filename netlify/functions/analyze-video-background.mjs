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
 * never seen by the caller, this owns the whole tail of the analysis step —
 * which now lives in lib/analyze-run.js, shared with the watchdog so a
 * recovered digest is built exactly like a normal one.
 *
 * Make therefore no longer calls notify-draft itself. It fires this and moves
 * on, and the card shows up when the work is genuinely done.
 *
 * A failure here would otherwise be silent, so failures send a Telegram
 * message naming the video and the reason. That message matters: Make has
 * already removed the candidate from the queue by the time this runs.
 *
 * Note what this cannot report: a request that never arrives, or a run killed
 * mid-flight by the platform, leaves no trace and sends nothing — on
 * 2026-07-29 a POST that Make recorded as successful never reached this
 * function at all. That gap is watchdog-background.mjs's job.
 *
 * Body accepts everything analyze-video.js accepts, plus:
 *   model   optional xAI model id, overriding XAI_MODEL for this run only
 *
 * Environment variables: XAI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 * MAKE_WEBHOOK_SECRET, SITE_URL.
 */

import { normalizePayload, defaultModel, clean } from "./lib/pipeline.js";
import { sendMessage, escapeTelegramHtml } from "./lib/telegram.js";
import { runAnalysis } from "./lib/analyze-run.js";

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
  const meta = normalizePayload(payload);

  try {
    console.log(`Analyzing "${meta.videoTitle}" by ${meta.channelName} via ${model}`);
    const result = await runAnalysis({ payload, model });
    if (!result.delivered) {
      await reportFailure(meta, model, result.deliveryErr, { draftStored: true });
    }
  } catch (err) {
    console.error("analyze-video-background failed:", err);
    await reportFailure(meta, model, err, { draftStored: false });
  }

  return new Response("", { status: 202 });
};

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
        escapeTelegramHtml(String(err?.message || err).slice(0, 300)),
        "",
        tail,
      ].join("\n")
    );
  } catch (notifyErr) {
    console.error("Could not report the failure to Telegram:", notifyErr.message);
  }
}
