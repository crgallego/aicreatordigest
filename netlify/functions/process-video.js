/**
 * AI Creator Digest — direct (no-approval) pipeline
 * https://aicreatordigest.com
 *
 * Analyzes a transcript with xAI Grok 4.5 and publishes immediately — no
 * Telegram/Google Docs approval gate. Use this for testing, or if you want
 * to bypass review for trusted content. For the approval-gated flow, Make
 * should call analyze-video.js instead; see that file and publish-video.js.
 *
 * Commits, per run:
 *   playlists/<playlist-slug>/videos/<video-slug>.md   the video digest
 *   playlists/<playlist-slug>/index.md                 the consensus guide
 *   creators/<creator-slug>.md                         the creator profile
 *   web/data/index.json                                the site manifest
 *   sitemap.xml                                        SEO
 *   feed.xml                                           RSS
 *
 * All three markdown file types carry their full structured content (key
 * points, tactics, quotes, agree/disagree) as JSON-encoded frontmatter — the
 * web app renders straight from that, never from the markdown body. The body
 * is a nicely formatted plain-language doc, kept only so the files are worth
 * reading directly on GitHub.
 *
 * Environment variables:
 *   XAI_API_KEY           xAI Grok 4.5 API key                        (required)
 *   GITHUB_TOKEN          GitHub PAT with repo write access           (required)
 *   GITHUB_REPO           crgallego/aicreatordigest                   (required)
 *   GITHUB_BRANCH         main                                        (optional, default "main")
 *   MAKE_WEBHOOK_SECRET   shared secret Make must send as             (optional, strongly recommended)
 *                         the `x-webhook-secret` header
 *   SITE_URL              https://aicreatordigest.com                 (optional)
 *
 * Payload fields (see normalizePayload): `videoDuration` is optional — if
 * Make can supply a human-readable runtime (e.g. from the YouTube Data API's
 * contentDetails.duration, formatted as "34:12"), pass it through and it'll
 * show up in the credit block and footer meta. Omit it entirely if you don't
 * have it; nothing gets fabricated in its place.
 */

import {
  normalizePayload,
  analyzeTranscript,
  shapeAnalysis,
  publishVideo,
  header,
  json,
  respond,
} from "./lib/pipeline.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return respond(204, "");
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed. POST a video payload." });
  }

  // Optional shared secret. This endpoint spends money (xAI tokens) and writes
  // to a public repo, so leaving it open is not recommended.
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      header(event, "x-webhook-secret") || header(event, "x-make-secret") || "";
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

  const missing = ["videoId", "videoTitle", "channelName", "transcript"].filter(
    (k) => !String(payload[k] || "").trim()
  );
  if (missing.length) {
    return json(400, { error: `Missing required field(s): ${missing.join(", ")}` });
  }

  for (const key of ["XAI_API_KEY", "GITHUB_TOKEN", "GITHUB_REPO"]) {
    if (!process.env[key]) {
      return json(500, { error: `Server is missing the ${key} environment variable` });
    }
  }

  try {
    const meta = normalizePayload(payload);
    console.log(`Processing "${meta.videoTitle}" by ${meta.channelName}`);

    const analysis = await analyzeTranscript(meta);
    const shaped = shapeAnalysis(analysis, meta);
    const result = await publishVideo({ meta, shaped, editorNote: "" });

    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error("process-video failed:", err);
    return json(err.statusCode || 500, {
      ok: false,
      error: err.message || "Unknown error",
      videoId: payload.videoId,
    });
  }
};
