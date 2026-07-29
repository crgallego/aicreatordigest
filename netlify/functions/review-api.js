/**
 * AI Creator Digest — backend for the Telegram Mini App review editor
 * https://aicreatordigest.com
 *
 * Everything the /review Mini App does, behind one endpoint:
 *
 *   GET  ?draftKey=…                    load a draft for editing
 *   POST {action:"save",    draftKey, edits}   persist edits, mint a preview token
 *   POST {action:"publish", draftKey, edits}   persist edits, then publish
 *   POST {action:"reject",  draftKey}          discard the draft
 *
 * Every call is authenticated with the signed initData Telegram hands the
 * Mini App, and restricted to the site owner (see lib/webapp-auth.js). None
 * of this trusts the client with anything structural: social links are always
 * re-derived server-side, and the published markdown is rendered from the
 * stored draft, never from HTML the browser sends up.
 *
 * Environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, plus the
 * GitHub/SITE_URL set publish-video.js needs.
 */

import { getStore } from "@netlify/blobs";
import {
  applyDraftEdits,
  publishVideo,
  parseRequestBody,
  json,
  respond,
} from "./lib/pipeline.js";
import { requireWebAppUser, signPreviewToken } from "./lib/webapp-auth.js";
import { deleteMessage, sendMessage } from "./lib/telegram.js";

const DRAFTS_STORE = "aicd-drafts";

/** Strips a stored draft down to just what the editor needs to render. */
function toEditable(draftKey, draft) {
  const { meta, shaped } = draft;
  return {
    draftKey,
    video: {
      videoId: meta.videoId,
      title: meta.videoTitle,
      videoUrl: meta.videoUrl,
      videoDuration: meta.videoDuration,
      channelName: meta.channelName,
      creatorName: shaped.creatorName || meta.channelName,
      playlistName: meta.playlistName,
      thumbnailUrl: `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`,
    },
    edits: {
      keyTakeaway: shaped.keyTakeaway || "",
      keyPoints: shaped.keyPoints || [],
      tactics: shaped.tactics || [],
      quotes: shaped.quotes || [],
      categories: shaped.categories || [],
      featuredPeople: (shaped.featuredPeople || []).map((p) => ({ name: p.name, role: p.role })),
      editorNote: draft.editorNote || "",
    },
    // Shown read-only in the editor: these are derived from the video's own
    // description, never typed, so the editor makes clear they aren't fields.
    derivedLinks: {
      creatorLinks: shaped.creatorLinks || [],
      featuredPeople: (shaped.featuredPeople || []).map((p) => ({ name: p.name, links: p.links || [] })),
    },
  };
}

/** Applies edits to a stored draft and writes it back. Returns the updated draft. */
async function saveEdits(store, draftKey, draft, edits) {
  const updated = {
    ...draft,
    shaped: applyDraftEdits(draft, edits),
    editorNote: String(edits.editorNote || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  await store.setJSON(draftKey, updated);
  return updated;
}

/** Clears the actionable card and leaves a one-line history record behind. */
async function closeOutCard(draft, text) {
  const { chatId, messageId } = draft;
  if (!chatId || !messageId) return;
  try {
    await deleteMessage(chatId, messageId);
    await sendMessage(chatId, text);
  } catch (err) {
    console.error("Telegram confirmation failed:", err.message);
  }
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(204, "");

  let payload = {};
  if (event.httpMethod === "POST") {
    try {
      payload = parseRequestBody(event);
    } catch {
      return json(400, { error: "Body is not valid JSON" });
    }
  }

  try {
    requireWebAppUser(event, payload);
  } catch (err) {
    return json(err.statusCode || 401, { error: err.message });
  }

  const draftKey = String(
    (event.httpMethod === "POST" ? payload.draftKey : event.queryStringParameters?.draftKey) || ""
  ).trim();
  if (!draftKey) return json(400, { error: "Missing required field: draftKey" });

  try {
    const store = getStore(DRAFTS_STORE);
    const draft = await store.get(draftKey, { type: "json" });
    if (!draft) {
      return json(404, {
        error: "That draft is gone — it may have already been published or rejected.",
      });
    }

    if (event.httpMethod === "GET") {
      return json(200, { ok: true, ...toEditable(draftKey, draft), previewToken: signPreviewToken(draftKey) });
    }

    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

    const action = String(payload.action || "").trim();

    if (action === "save") {
      const updated = await saveEdits(store, draftKey, draft, payload.edits || {});
      return json(200, {
        ok: true,
        previewToken: signPreviewToken(draftKey),
        derivedLinks: toEditable(draftKey, updated).derivedLinks,
      });
    }

    if (action === "reject") {
      await store.delete(draftKey);
      await closeOutCard(draft, `❌ <b>Rejected:</b> ${draft.meta.videoTitle}\n${draft.meta.channelName}`);
      return json(200, { ok: true, draftKey });
    }

    if (action === "publish") {
      for (const key of ["GITHUB_TOKEN", "GITHUB_REPO"]) {
        if (!process.env[key]) {
          return json(500, { error: `Server is missing the ${key} environment variable` });
        }
      }

      // Save first so a failed publish doesn't lose the edits — the draft
      // stays put and can be retried from the card.
      const updated = await saveEdits(store, draftKey, draft, payload.edits || {});

      const result = await publishVideo({
        meta: updated.meta,
        shaped: updated.shaped,
        editorNote: updated.editorNote,
      });

      await store.delete(draftKey);
      await closeOutCard(
        updated,
        `✅ <b>Published:</b> ${updated.meta.videoTitle}\n${updated.meta.channelName}\n${result.url}`
      );

      return json(200, { ok: true, ...result });
    }

    return json(400, { error: `Unknown action: ${action || "(none)"}` });
  } catch (err) {
    console.error("review-api failed:", err);
    return json(err.statusCode || 500, { ok: false, error: err.message || "Unknown error", draftKey });
  }
};
