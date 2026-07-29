/**
 * AI Creator Digest — publish phase (Telegram approval flow)
 * https://aicreatordigest.com
 *
 * Phase 2 of the approval-gated pipeline. Called by Make's "publish" scenario
 * after you tap Approve in Telegram — Make fetches the Google Doc's current
 * text (via its Google Docs connection, so no doc credential is needed here)
 * and POSTs it alongside the draftKey. This function:
 *   1. Loads the original draft from Netlify Blobs (by draftKey)
 *   2. Parses the doc's current text — your edits win outright over the
 *      original AI keyPoints/tactics/quotes/categories/keyTakeaway wherever
 *      you changed them; an emptied section is dropped, not defaulted back
 *   3. Runs the same publish cascade process-video.js runs directly: video
 *      page, creator profile, consensus guide, manifest, sitemap, feed
 *   4. Deletes the draft from Blobs — a video is only ever published once
 *
 * Environment variables: GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, SITE_URL
 * (same as process-video.js), plus MAKE_WEBHOOK_SECRET.
 */

import { getStore } from "@netlify/blobs";
import {
  parseDraftText,
  applyDraftEdits,
  publishVideo,
  header,
  parseRequestBody,
  json,
  respond,
} from "./lib/pipeline.js";
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
  const docText = String(payload.docText || "");
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

    // Two ways in. With docText, the edits came from the Google Doc round trip
    // and are folded onto the draft. Without it, the draft in Blobs is already
    // the final word — that's the "publish as-is" button, and it carries
    // whatever the Mini App editor last saved.
    let finalShaped;
    let editorNote;
    if (docText.trim()) {
      const parsed = parseDraftText(docText);
      finalShaped = applyDraftEdits(draft, parsed);
      editorNote = parsed.editorNote;
    } else {
      finalShaped = draft.shaped;
      editorNote = draft.editorNote || "";
    }

    const result = await publishVideo({
      meta: draft.meta,
      shaped: finalShaped,
      editorNote,
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
