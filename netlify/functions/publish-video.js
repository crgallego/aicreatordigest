/**
 * AI Creator Digest — publish phase (Telegram approval flow)
 * https://aicreatordigest.com
 *
 * Phase 2 of the approval-gated pipeline. Called by Make when you tap
 * "Publish as-is" on a draft card. This function:
 *   1. Loads the draft from Netlify Blobs (by draftKey)
 *   2. Publishes it exactly as stored — whatever the Mini App editor
 *      (review-api.js) last saved is the final word, with no second
 *      interpretation of the content happening here
 *   3. Runs the same publish cascade process-video.js runs directly: video
 *      page, creator profile, consensus guide, manifest, sitemap, feed
 *   4. Deletes the draft from Blobs — a video is only ever published once
 *
 * The Mini App has its own publish path in review-api.js, which saves your
 * pending edits first and then calls the same publishVideo cascade.
 *
 * Environment variables: GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, SITE_URL
 * (same as process-video.js), plus MAKE_WEBHOOK_SECRET.
 */

import { getStore } from "@netlify/blobs";
import { publishVideo, header, parseRequestBody, json, respond } from "./lib/pipeline.js";
import { deleteMessage, sendMessage } from "./lib/telegram.js";

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
    payload = parseRequestBody(event);
  } catch {
    return json(400, { error: "Body is not valid JSON" });
  }

  const draftKey = String(payload.draftKey || "").trim();
  if (!draftKey) {
    return json(400, { error: "Missing required field: draftKey" });
  }

  for (const key of ["GITHUB_TOKEN", "GITHUB_REPO"]) {
    if (!process.env[key]) {
      return json(500, { error: `Server is missing the ${key} environment variable` });
    }
  }

  try {
    const store = getStore(DRAFTS_STORE);
    const draft = await store.get(draftKey, { type: "json" });
    if (!draft) {
      return json(404, {
        error: `No stored draft found for ${draftKey}. It may have already been published or rejected.`,
      });
    }

    const result = await publishVideo({
      meta: draft.meta,
      shaped: draft.shaped,
      editorNote: draft.editorNote || "",
    });

    await store.delete(draftKey);

    // Remove the actionable card and drop a plain confirmation in its place —
    // best effort, since the GitHub commit already succeeded either way.
    const chatId = payload.chatId || draft.chatId;
    const messageId = payload.messageId || draft.messageId;
    if (chatId && messageId) {
      try {
        await deleteMessage(chatId, messageId);
        const lines = [`✅ <b>Published:</b> ${draft.meta.videoTitle}`, draft.meta.channelName, result.url].filter(
          Boolean
        );
        await sendMessage(chatId, lines.join("\n"));
      } catch (err) {
        console.error("Telegram confirmation failed (video was still published):", err.message);
      }
    }

    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error("publish-video failed:", err);
    return json(err.statusCode || 500, {
      ok: false,
      error: err.message || "Unknown error",
      draftKey,
    });
  }
};
