/**
 * AI Creator Digest — analysis phase (Telegram approval flow)
 * https://aicreatordigest.com
 *
 * Phase 1 of the approval-gated pipeline. Runs the same xAI analysis as
 * process-video.js, but does NOT touch GitHub. Instead it stores the draft
 * in Netlify Blobs and returns it as JSON so Make can:
 *   1. Create a Google Doc from `docHtml` for you to review/edit
 *   2. Share that Doc with you as Editor
 *   3. POST {draftKey, docUrl, ...} to notify-draft, which sends the
 *      Telegram approval card
 *
 * Nothing is published until you tap Approve in Telegram — see
 * publish-video.js for what happens then.
 *
 * Environment variables: same as process-video.js, minus the GitHub ones
 * (XAI_API_KEY and MAKE_WEBHOOK_SECRET only — this function never commits).
 */

import { getStore } from "@netlify/blobs";
import {
  normalizePayload,
  analyzeTranscript,
  shapeAnalysis,
  renderDraftText,
  textToSimpleHtml,
  header,
  parseRequestBody,
  json,
  respond,
} from "./lib/pipeline.js";

const DRAFTS_STORE = "aicd-drafts";

export const handler = async (event) => {
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

    const analysis = await analyzeTranscript(meta);
    const shaped = shapeAnalysis(analysis);
    const docText = renderDraftText(meta, shaped);
    const docHtml = textToSimpleHtml(docText);

    const draftKey = meta.videoId;
    const store = getStore(DRAFTS_STORE);
    await store.setJSON(draftKey, { meta, shaped, createdAt: new Date().toISOString() });

    return json(200, {
      ok: true,
      draftKey,
      docText,
      docHtml,
      title: meta.videoTitle,
      creatorName: shaped.creatorName || meta.channelName,
      channelName: meta.channelName,
      playlistName: meta.playlistName,
      playlistSlug: meta.playlistSlug,
      keyTakeaway: shaped.keyTakeaway,
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
