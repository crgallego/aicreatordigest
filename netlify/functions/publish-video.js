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
  publishVideo,
  estimateReadMinutes,
  header,
  json,
  respond,
} from "./lib/pipeline.js";
import { editMessageText } from "./lib/telegram.js";

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
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body is not valid JSON" });
  }

  const draftKey = String(payload.draftKey || "").trim();
  const docText = String(payload.docText || "");
  if (!draftKey || !docText.trim()) {
    return json(400, { error: "Missing required field(s): draftKey, docText" });
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

    const parsed = parseDraftText(docText);

    // keyTakeaway is required for the page to make sense — treat an emptied
    // one as an accidental deletion, not an intentional edit. Every other
    // section is trusted at face value: empty means "drop it."
    const finalShaped = {
      ...draft.shaped,
      keyTakeaway: parsed.keyTakeaway || draft.shaped.keyTakeaway,
      keyPoints: parsed.keyPoints,
      tactics: parsed.tactics,
      quotes: parsed.quotes,
      categories: parsed.categories.length ? parsed.categories : draft.shaped.categories,
    };
    finalShaped.readTimeMinutes = estimateReadMinutes([
      finalShaped.keyTakeaway,
      ...finalShaped.keyPoints.map((p) => `${p.title} ${p.body}`),
      ...finalShaped.tactics.map((t) => `${t.title} ${t.body}`),
      ...finalShaped.quotes.map((q) => q.text),
    ]);

    const result = await publishVideo({
      meta: draft.meta,
      shaped: finalShaped,
      editorNote: parsed.editorNote,
    });

    await store.delete(draftKey);

    // Confirm in Telegram if Make told us which message to update — best
    // effort, since the GitHub commit already succeeded either way.
    const chatId = payload.chatId;
    const messageId = payload.messageId;
    if (chatId && messageId) {
      try {
        await editMessageText(
          chatId,
          messageId,
          `✅ <b>Published:</b> ${draft.meta.videoTitle}\n${result.url}`
        );
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
