/**
 * AI Creator Digest — run one transcript through several models and compare
 * https://aicreatordigest.com
 *
 * A bench, not part of the publishing path. Nothing it produces is ever
 * published; it exists so a model choice is made on evidence from real
 * transcripts rather than on vibes or vendor benchmarks.
 *
 * Runs each model in turn against the same transcript and reports, per model:
 * wall-clock seconds, the key takeaway it produced, and how many key points,
 * tactics and quotes it found. A Telegram summary arrives when it finishes,
 * and the full outputs are kept in Blobs for closer reading.
 *
 * Sequential on purpose: parallel runs would contend and make the timings
 * meaningless, and timing is half the point given the 30 second ceiling that
 * pushed analysis into the background in the first place.
 *
 * Background function, so a slow model cannot kill the comparison.
 *
 *   POST /.netlify/functions/compare-models-background
 *   { "videoId": "abc123", "models": ["grok-4.5", "grok-4.3"] }
 *
 * Supplying `transcript` directly skips the fetch. Omitting `models` uses
 * COMPARE_MODELS, or a sensible default spread of what the key can reach.
 */

import { getStore } from "@netlify/blobs";
import { normalizePayload, analyzeTranscript, shapeAnalysis, clean } from "./lib/pipeline.js";
import { sendMessage, escapeTelegramHtml } from "./lib/telegram.js";

const RESULTS_STORE = "aicd-model-comparisons";
const DEFAULT_MODELS = ["grok-4.5", "grok-4.3", "grok-4.20-0309-non-reasoning"];

export default async (req) => {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret") || "";
    if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Body is not valid JSON", { status: 400 });
  }

  const videoId = clean(payload.videoId);
  if (!videoId && !clean(payload.transcript)) {
    return new Response("Supply videoId or transcript", { status: 400 });
  }

  const models = Array.isArray(payload.models) && payload.models.length
    ? payload.models.map(clean).filter(Boolean)
    : String(process.env.COMPARE_MODELS || "").split(",").map((m) => m.trim()).filter(Boolean).length
      ? String(process.env.COMPARE_MODELS).split(",").map((m) => m.trim()).filter(Boolean)
      : DEFAULT_MODELS;

  runComparison({ videoId, payload, models }).catch((err) =>
    console.error("compare-models failed outright:", err)
  );

  return new Response("", { status: 202 });
};

async function runComparison({ videoId, payload, models }) {
  let transcript = clean(payload.transcript);
  if (!transcript) {
    const res = await fetch(
      `${process.env.SITE_URL || ""}/.netlify/functions/fetch-transcript?videoId=${encodeURIComponent(videoId)}`,
      { headers: { "x-webhook-secret": process.env.MAKE_WEBHOOK_SECRET || "" } }
    );
    const data = await res.json();
    if (!data.transcript) throw new Error(`No transcript for ${videoId}: ${data.error || "unknown"}`);
    transcript = data.transcript;
  }

  const meta = normalizePayload({
    videoId: videoId || "compare",
    videoTitle: clean(payload.videoTitle) || "Model comparison",
    channelName: clean(payload.channelName) || "Comparison",
    transcript,
  });

  const results = [];
  for (const model of models) {
    const startedAt = Date.now();
    try {
      const analysis = await analyzeTranscript(meta, { model });
      const shaped = shapeAnalysis(analysis, meta);
      results.push({
        model,
        ok: true,
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
        keyTakeaway: shaped.keyTakeaway,
        counts: {
          keyPoints: shaped.keyPoints.length,
          tactics: shaped.tactics.length,
          quotes: shaped.quotes.length,
          categories: shaped.categories.length,
        },
        shaped,
      });
    } catch (err) {
      results.push({
        model,
        ok: false,
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
        error: String(err.message || err).slice(0, 250),
      });
    }
  }

  const key = `${videoId || "compare"}-${new Date().toISOString()}`;
  await getStore(RESULTS_STORE).setJSON(key, {
    videoId,
    transcriptChars: transcript.length,
    ranAt: new Date().toISOString(),
    results,
  });

  await sendSummary(meta, transcript.length, results, key);
}

async function sendSummary(meta, transcriptChars, results, key) {
  if (!process.env.TELEGRAM_CHAT_ID || !process.env.TELEGRAM_BOT_TOKEN) return;

  const lines = [
    `🔬 <b>Model comparison</b>`,
    escapeTelegramHtml(meta.videoTitle),
    `${transcriptChars.toLocaleString()} chars of transcript`,
    "",
  ];

  const ok = results.filter((r) => r.ok);
  const fastest = ok.length ? Math.min(...ok.map((r) => r.seconds)) : null;

  for (const r of results) {
    if (!r.ok) {
      lines.push(`❌ <b>${escapeTelegramHtml(r.model)}</b> — failed after ${r.seconds}s`);
      lines.push(escapeTelegramHtml(r.error));
      lines.push("");
      continue;
    }
    const flag = r.seconds === fastest ? " ⚡" : "";
    lines.push(`<b>${escapeTelegramHtml(r.model)}</b> — ${r.seconds}s${flag}`);
    lines.push(
      `${r.counts.keyPoints} points · ${r.counts.tactics} tactics · ${r.counts.quotes} quotes`
    );
    lines.push(`<i>${escapeTelegramHtml(String(r.keyTakeaway).slice(0, 220))}</i>`);
    lines.push("");
  }

  lines.push(`Full output stored as <code>${escapeTelegramHtml(key)}</code>`);
  await sendMessage(process.env.TELEGRAM_CHAT_ID, lines.join("\n"));
}
