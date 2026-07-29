/**
 * AI Creator Digest — analysis phase (Telegram approval flow)
 * https://aicreatordigest.com
 *
 * Phase 1 of the approval-gated pipeline. Runs the same xAI analysis as
 * process-video.js, but does NOT touch GitHub. It stores the draft in Netlify
 * Blobs and returns a summary, which Make passes to notify-draft to send the
 * Telegram card.
 *
 * Review and editing happen in the Mini App (web/review.html), which reads
 * the stored draft through review-api.js. Nothing is published until you
 * approve — see publish-video.js and review-api.js for what happens then.
 *
 * Environment variables: same as process-video.js, minus the GitHub ones
 * (XAI_API_KEY and MAKE_WEBHOOK_SECRET only — this function never commits).
 */

import { getStore } from "@netlify/blobs";
import {
  normalizePayload,
  analyzeTranscript,
  shapeAnalysis,
  header,
  parseRequestBody,
  json,
  respond,
} from "./lib/pipeline.js";
import { toV2 } from "./lib/http-compat.js";

const DRAFTS_STORE = "aicd-drafts";

export const run = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, "");
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed. POST a video payload." });
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

  const missing = ["videoId", "videoTitle", "channelName", "transcript"].filter(
    (k) => !String(payload[k] || "").trim()
  );
  if (missing.length) {
    return json(400, { error: `Missing required field(s): ${missing.join(", ")}` });
  }

  if (!process.env.XAI_API_KEY) {
    return json(500, { error: "Server is missing the XAI_API_KEY environment variable" });
  }

  try {
    const meta = normalizePayload(payload);
    console.log(`Analyzing "${meta.videoTitle}" by ${meta.channelName}`);

    const { analysis, run } = await analyzeTranscript(meta);
    const shaped = shapeAnalysis(analysis, meta);

    const draftKey = meta.videoId;
    const store = getStore(DRAFTS_STORE);
    await store.setJSON(draftKey, { meta, shaped, createdAt: new Date().toISOString() });

    return json(200, {
      ok: true,
      draftKey,
      title: meta.videoTitle,
      creatorName: shaped.creatorName || meta.channelName,
      channelName: meta.channelName,
      playlistName: meta.playlistName,
      playlistSlug: meta.playlistSlug,
      keyTakeaway: shaped.keyTakeaway,
      executiveSummary: shaped.executiveSummary,
      categories: shaped.categories,
      readTimeMinutes: shaped.readTimeMinutes,
    });
  } catch (err) {
    console.error("analyze-video failed:", err);
    return json(err.statusCode || 500, {
      ok: false,
      error: err.message || "Unknown error",
      videoId: payload.videoId,
    });
  }
};

// Netlify selects the v1 runtime whenever a `handler` export exists, and the v1
// runtime never receives the Blobs context. The export is named `run` so this file
// resolves as v2; tests call `run` directly. See lib/http-compat.js.
export default toV2(run);
