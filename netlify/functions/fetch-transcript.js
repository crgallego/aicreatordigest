/**
 * AI Creator Digest — free transcript fetcher
 * https://aicreatordigest.com
 *
 * Given a YouTube video ID, returns its caption track as plain text plus raw
 * timed segments, using the public caption endpoint YouTube's own player
 * calls — no API key, no per-video cost. Make calls this instead of a paid
 * transcript vendor; this endpoint's job is purely to answer "here's the
 * transcript" so Make can hand it to /api/process-video.
 *
 * Known trade-off (see youtube-caption-extractor's own README): shared
 * serverless IP ranges — which is exactly what Netlify Functions run on —
 * can occasionally get bot-gated by YouTube ("LOGIN_REQUIRED - Sign in to
 * confirm you're not a bot"). This function retries a few times on that
 * specific error, since it's transient, but if it starts failing constantly
 * in production, swap Make over to a paid provider (e.g. Supadata) for this
 * one step — nothing else in the pipeline needs to change.
 *
 * Environment variables:
 *   MAKE_WEBHOOK_SECRET   same shared secret as process-video.js (optional,
 *                         strongly recommended — this endpoint spends
 *                         Netlify invocation time and YouTube's goodwill on
 *                         every call, so it shouldn't be left open)
 */

import { getSubtitles } from "youtube-caption-extractor";

const DEFAULT_LANG = "en";
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 300;

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed. GET or POST a videoId." });
  }

  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided = header(event, "x-webhook-secret") || header(event, "x-make-secret") || "";
    if (provided !== secret) {
      return json(401, { ok: false, error: "Unauthorized" });
    }
  }

  const params = readParams(event);
  const videoId = clean(params.videoId || params.videoID);
  const lang = clean(params.lang) || DEFAULT_LANG;

  if (!videoId) {
    return json(400, { ok: false, error: "Missing required field: videoId" });
  }

  try {
    const segments = await getSubtitlesWithRetry(videoId, lang);

    if (!segments.length) {
      return json(200, {
        ok: true,
        hasTranscript: false,
        videoId,
        lang,
        transcript: "",
        segments: [],
        videoDuration: "",
      });
    }

    const transcript = segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return json(200, {
      ok: true,
      hasTranscript: true,
      videoId,
      lang,
      transcript,
      segments,
      videoDuration: formatDuration(segments),
    });
  } catch (err) {
    const { code, status, message } = classifyError(err);
    return json(status, { ok: false, error: message, reason: code, videoId });
  }
};

/* ------------------------------------------------------------------ *
 * Extraction with retry
 * ------------------------------------------------------------------ */

async function getSubtitlesWithRetry(videoId, lang) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await getSubtitles({ videoID: videoId, lang });
    } catch (err) {
      lastErr = err;
      if (classifyError(err).code !== "transient_extraction_failure") {
        throw err;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
  }
  throw lastErr;
}

/**
 * Mirrors the classification the library's own README recommends — a stable
 * way to tell "YouTube's bot check, try again" apart from "this video is
 * genuinely gone" apart from "something else broke."
 */
function classifyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/LOGIN_REQUIRED|not a bot/i.test(msg)) {
    return {
      code: "transient_extraction_failure",
      status: 502,
      message: "YouTube's bot check blocked this request. This is usually transient — retry the run.",
    };
  }
  if (/unavailable|private|removed|does not exist/i.test(msg)) {
    return {
      code: "video_not_accessible",
      status: 404,
      message: "This video is private, deleted, or otherwise unavailable.",
    };
  }
  return { code: "extraction_failed", status: 502, message: msg.slice(0, 300) };
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function readParams(event) {
  if (event.httpMethod === "GET") {
    return event.queryStringParameters || {};
  }
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

/** "34:12" / "1:04:22" style runtime, derived from the last segment — a free
 * bonus that can feed straight into process-video.js's optional videoDuration field. */
function formatDuration(segments) {
  const last = segments[segments.length - 1];
  const totalSeconds = Math.round(parseFloat(last.start) + parseFloat(last.dur));
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function clean(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function header(event, name) {
  const headers = event.headers || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function respond(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8" }, body };
}

function json(statusCode, obj) {
  return respond(statusCode, JSON.stringify(obj));
}
