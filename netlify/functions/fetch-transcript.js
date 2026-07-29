/**
 * AI Creator Digest — transcript fetcher
 * https://aicreatordigest.com
 *
 * Given a YouTube video ID, returns its caption track as plain text plus raw
 * timed segments. Make calls this and hands the result to analyze-video.js.
 *
 * Two sources, tried in order, first success wins:
 *
 *   1. Supadata, when SUPADATA_API_KEY is set. A paid vendor whose business is
 *      keeping this working, so it is the production path.
 *   2. youtube-caption-extractor, the free keyless library. No cost, but it
 *      reads the same endpoint YouTube's own player uses, and YouTube bot-gates
 *      cloud IP ranges. Measured 2026-07-29: it failed 6 of 6 attempts from
 *      Netlify and 1 of 1 from Make's egress, while succeeding from a
 *      residential connection. Treat it as a local-development convenience,
 *      not a production source.
 *
 * Both sources normalise to the same segment shape, so nothing downstream
 * knows or cares which one answered. The response reports `source` so a run
 * can be traced back to where its text came from.
 *
 * Environment variables:
 *   SUPADATA_API_KEY      enables the vendor path (required in production)
 *   MAKE_WEBHOOK_SECRET   same shared secret as the other functions (optional,
 *                         strongly recommended — this endpoint spends vendor
 *                         credits on every call, so it shouldn't be left open)
 */

import { getSubtitles } from "youtube-caption-extractor";

const DEFAULT_LANG = "en";
const FREE_MAX_ATTEMPTS = 3;
const FREE_RETRY_BASE_MS = 300;

const SUPADATA_BASE = "https://api.supadata.ai/v1/transcript";
const SUPADATA_JOB_POLLS = 6;
const SUPADATA_JOB_INTERVAL_MS = 2000;

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

  const sources = [];
  if (process.env.SUPADATA_API_KEY) sources.push({ name: "supadata", run: fetchFromSupadata });
  sources.push({ name: "youtube-caption-extractor", run: fetchFromFreeLibrary });

  const failures = [];
  for (const source of sources) {
    try {
      const segments = await source.run(videoId, lang);

      if (!segments.length) {
        return json(200, {
          ok: true,
          hasTranscript: false,
          videoId,
          lang,
          source: source.name,
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
        source: source.name,
        transcript,
        segments,
        videoDuration: formatDuration(segments),
      });
    } catch (err) {
      const classified = classifyError(err);
      failures.push({ source: source.name, ...classified });

      // A video that is genuinely private or deleted will fail identically
      // everywhere. Trying the next source only wastes time and credits.
      if (classified.code === "video_not_accessible") {
        return json(classified.status, {
          ok: false,
          error: classified.message,
          reason: classified.code,
          videoId,
        });
      }
    }
  }

  const primary = failures[0] || {
    status: 502,
    message: "No transcript source was available.",
    code: "no_source",
  };
  return json(primary.status, {
    ok: false,
    error: primary.message,
    reason: primary.code,
    videoId,
    // Every source's own failure, so a bad run is diagnosable from one response
    // instead of requiring a log dive.
    attempts: failures.map((f) => ({ source: f.source, reason: f.code, error: f.message })),
    ...(process.env.SUPADATA_API_KEY
      ? {}
      : {
          hint: "SUPADATA_API_KEY is not set, so only the free source was tried. YouTube bot-gates cloud IPs, so the free source is expected to fail in production.",
        }),
  });
};

/* ------------------------------------------------------------------ *
 * Source 1: Supadata
 * ------------------------------------------------------------------ */

async function fetchFromSupadata(videoId, lang) {
  const url = `${SUPADATA_BASE}?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&lang=${encodeURIComponent(lang)}`;

  const res = await fetch(url, {
    headers: { "x-api-key": process.env.SUPADATA_API_KEY },
  });

  // Large videos needing fresh transcription come back as a job. Existing
  // caption tracks, which is all this pipeline asks for, answer synchronously.
  // The polling path below is written to the documented shape but has not been
  // exercised against a real 202; if it ever misbehaves, that is the first
  // place to look.
  if (res.status === 202) {
    return await pollSupadataJob(await safeJson(res));
  }

  if (!res.ok) {
    const body = await safeJson(res);
    const detail = body?.message || body?.error || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Supadata rejected the API key: ${detail}`);
    }
    if (res.status === 404) {
      throw new Error(`unavailable: Supadata could not find captions for this video (${detail})`);
    }
    if (res.status === 429) {
      throw new Error(`Supadata rate limit or credit limit reached: ${detail}`);
    }
    throw new Error(`Supadata request failed: ${detail}`);
  }

  return normalizeSupadataContent(await res.json());
}

async function pollSupadataJob(body) {
  const jobId = body?.jobId || body?.id || body?.job_id;
  if (!jobId) throw new Error("Supadata returned a job response with no recognisable job id");

  for (let attempt = 0; attempt < SUPADATA_JOB_POLLS; attempt++) {
    await sleep(SUPADATA_JOB_INTERVAL_MS);
    const res = await fetch(`${SUPADATA_BASE}/${encodeURIComponent(jobId)}`, {
      headers: { "x-api-key": process.env.SUPADATA_API_KEY },
    });
    if (!res.ok) continue;

    const data = await res.json();
    const status = String(data?.status || "").toLowerCase();
    if (data?.content) return normalizeSupadataContent(data);
    if (status === "failed" || status === "error") {
      throw new Error(`Supadata job failed: ${data?.error || "no reason given"}`);
    }
  }
  throw new Error("Supadata transcription job did not finish in time");
}

/** Supadata segments carry millisecond offsets. The rest of this pipeline
 * expects seconds-as-strings, matching the free library, so convert once here
 * and let everything downstream stay source-agnostic. */
function normalizeSupadataContent(data) {
  const content = data?.content;
  if (typeof content === "string") {
    return content.trim() ? [{ text: content.trim(), start: "0", dur: "0" }] : [];
  }
  if (!Array.isArray(content)) return [];

  return content
    .filter((c) => c && typeof c.text === "string")
    .map((c) => ({
      text: c.text,
      start: msToSeconds(c.offset),
      dur: msToSeconds(c.duration),
    }));
}

function msToSeconds(ms) {
  const n = Number(ms);
  return Number.isFinite(n) ? String(n / 1000) : "0";
}

/* ------------------------------------------------------------------ *
 * Source 2: the free library
 * ------------------------------------------------------------------ */

async function fetchFromFreeLibrary(videoId, lang) {
  let lastErr;
  for (let attempt = 1; attempt <= FREE_MAX_ATTEMPTS; attempt++) {
    try {
      return await getSubtitles({ videoID: videoId, lang });
    } catch (err) {
      lastErr = err;
      if (classifyError(err).code !== "transient_extraction_failure") throw err;
      if (attempt < FREE_MAX_ATTEMPTS) await sleep(FREE_RETRY_BASE_MS * attempt);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

function classifyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/LOGIN_REQUIRED|not a bot/i.test(msg)) {
    return {
      code: "bot_gated",
      status: 502,
      message:
        "YouTube's bot check blocked this request. Cloud IPs are gated persistently, so set SUPADATA_API_KEY rather than retrying.",
    };
  }
  if (/rejected the API key/i.test(msg)) {
    return { code: "vendor_auth_failed", status: 502, message: msg.slice(0, 300) };
  }
  if (/rate limit|credit limit/i.test(msg)) {
    return { code: "vendor_limit_reached", status: 502, message: msg.slice(0, 300) };
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

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

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
 * bonus that can feed straight into the optional videoDuration field. */
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
