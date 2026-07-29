/**
 * AI Creator Digest — the watchdog
 * https://aicreatordigest.com
 *
 * Why this exists
 * ---------------
 * When you tap Process, Make deletes the candidate record and marks the video
 * seen *immediately*, then fires the analysis and forgets about it. That is
 * fine while everything works. It is unrecoverable when it doesn't: the queue
 * entry is already gone, so a video whose analysis never happens leaves no
 * card, no error, and no trace of ever having existed.
 *
 * On 2026-07-29 that happened for real. Make recorded the POST to
 * analyze-video-background as a successful operation; Netlify has no record of
 * ever receiving it. The request was lost between the two. Ten minutes of
 * silence was the only symptom, and nothing in the system would ever have
 * noticed.
 *
 * analyze-video-background already reports its own failures, but it can only
 * report failures it survives. A request that never arrives, or a run killed
 * mid-flight, is invisible from the inside. Something outside has to check.
 *
 * What it does
 * ------------
 * Make calls this every 15 minutes for each recently-seen video. For each one:
 *
 *   1. A draft exists          → nothing to do, stay quiet.
 *   2. Already published       → nothing to do, forget about it.
 *   3. Neither, and it's young → too early to judge; wait.
 *   4. Neither, and it's late  → the video was lost. Rebuild its metadata from
 *                                YouTube and re-run the analysis, once.
 *   5. Recovery also failed    → say so in Telegram, once, and stop.
 *
 * It stays quiet in the healthy case on purpose. A watchdog that reports good
 * news every fifteen minutes is a watchdog you learn to ignore, and then it is
 * worth nothing on the day it has something to say.
 *
 * Published state is read from GitHub rather than the live site, deliberately:
 * SITE_URL points at a custom domain that is not currently connected, and a
 * watchdog that depends on the thing most likely to be broken is not a
 * watchdog. GitHub is where publishing actually commits.
 *
 * Body (form-encoded or JSON), as Make sends it from the "seen" data store:
 *   videoId       required
 *   playlistSlug  optional, used to name the playlist on a recovered digest
 *   processedAt   optional ISO timestamp of when Process was tapped
 *
 * Environment variables: XAI_API_KEY, YOUTUBE_API_KEY, GITHUB_TOKEN,
 * TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, MAKE_WEBHOOK_SECRET, SITE_URL.
 */

import { getStore } from "@netlify/blobs";
import {
  INDEX_PATH,
  defaultModel,
  clean,
  getFile,
  normalizeIndex,
  safeJson,
} from "./lib/pipeline.js";
import { sendMessage, escapeTelegramHtml } from "./lib/telegram.js";
import { fetchVideoDetails } from "./lib/youtube.js";
import { runAnalysis, DRAFTS_STORE } from "./lib/analyze-run.js";

const WATCHDOG_STORE = "aicd-watchdog";

/**
 * How long after Process a video is allowed to have produced nothing before it
 * counts as lost. A normal run takes about a minute; the longest observed was
 * 56 seconds. Ten minutes is far enough past that to avoid racing a slow run,
 * and still soon enough that you find out the same session.
 */
const GRACE_MS = 10 * 60 * 1000;

/** One automatic retry. Beyond that it is a real fault, not a dropped packet. */
const MAX_RECOVERIES = 1;

export default async (req) => {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret") || req.headers.get("x-make-secret") || "";
    if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  }

  let payload;
  try {
    const contentType = req.headers.get("content-type") || "";
    payload = contentType.includes("x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(await req.text()))
      : await req.json();
  } catch {
    return new Response("Body is not valid JSON", { status: 400 });
  }

  const videoId = clean(payload.videoId);
  if (!videoId) return new Response("Missing required field: videoId", { status: 400 });

  try {
    const status = await check(videoId, payload);
    console.log(`Watchdog ${videoId}: ${status}`);
  } catch (err) {
    console.error(`Watchdog ${videoId} failed:`, err);
    // A watchdog that dies silently is exactly the failure it was built to
    // catch, so its own errors are worth a message too.
    await notify(
      [
        `⚠️ <b>Watchdog error</b> for <code>${escapeTelegramHtml(videoId)}</code>`,
        escapeTelegramHtml(String(err?.message || err).slice(0, 300)),
      ].join("\n")
    );
  }

  return new Response("", { status: 202 });
};

async function check(videoId, payload) {
  const drafts = getStore(DRAFTS_STORE);

  // 1. A draft exists — the normal path worked.
  const draft = await drafts.get(videoId, { type: "json" }).catch(() => null);
  if (draft) {
    await forget(videoId);
    return "ok (draft present)";
  }

  // 2. Already published. Publishing deletes the draft, so an absent draft is
  //    only alarming if the digest never made it to the repo either.
  if (await isPublished(videoId)) {
    await forget(videoId);
    return "ok (published)";
  }

  // 3. Still within the grace period — a slow run is not a lost one.
  const processedAt = Date.parse(clean(payload.processedAt) || "") || null;
  const age = processedAt ? Date.now() - processedAt : null;
  if (age !== null && age < GRACE_MS) {
    return `too early (${Math.round(age / 1000)}s old)`;
  }

  // 4. Lost. Recover it, at most once.
  const state = (await getStore(WATCHDOG_STORE).get(videoId, { type: "json" }).catch(() => null)) || {
    recoveries: 0,
    alerted: false,
  };

  if (state.recoveries >= MAX_RECOVERIES) {
    if (!state.alerted) {
      await notify(
        [
          `🔴 <b>Video lost</b>`,
          escapeTelegramHtml(state.title || videoId),
          "",
          `Its analysis produced no draft, and re-running it did not help either.`,
          `This is a real fault rather than a dropped request.`,
          "",
          `Video id <code>${escapeTelegramHtml(videoId)}</code>`,
          state.lastError ? `\nLast error: ${escapeTelegramHtml(String(state.lastError).slice(0, 250))}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
      await remember(videoId, { ...state, alerted: true });
    }
    return "lost (already alerted)";
  }

  return await recover(videoId, payload, state);
}

/**
 * Rebuilds what Make threw away and runs the analysis again.
 *
 * The candidate record is long gone by now, so the title, description and
 * channel all have to come back from YouTube. Without YOUTUBE_API_KEY there is
 * nothing to rebuild from, and the honest move is to say so rather than invent
 * a title.
 */
async function recover(videoId, payload, state) {
  const details = await fetchVideoDetails(videoId);

  if (!details) {
    await remember(videoId, {
      ...state,
      recoveries: MAX_RECOVERIES,
      lastError: "Could not rebuild the video's metadata from YouTube.",
    });
    await notify(
      [
        `🔴 <b>Video lost</b> — <code>${escapeTelegramHtml(videoId)}</code>`,
        "",
        `Its analysis produced no draft, and YouTube would not return the video's`,
        `details, so it could not be re-run automatically.`,
        "",
        process.env.YOUTUBE_API_KEY
          ? `The video may be private or deleted.`
          : `YOUTUBE_API_KEY is not set, which is why recovery was not possible.`,
      ].join("\n")
    );
    return "lost (no metadata to recover from)";
  }

  const playlistSlug = clean(payload.playlistSlug);
  await remember(videoId, {
    ...state,
    recoveries: state.recoveries + 1,
    title: details.title,
    attemptedAt: new Date().toISOString(),
  });

  console.log(`Watchdog recovering "${details.title}" (${videoId})`);

  try {
    await runAnalysis({
      payload: {
        videoId,
        videoTitle: details.title,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        videoDescription: details.description,
        channelName: details.channelTitle,
        channelUrl: details.channelUrl,
        playlistSlug,
        playlistName: await playlistNameFor(playlistSlug),
      },
      model: defaultModel(),
      note: "Recovered by the watchdog — its first run was lost in transit.",
    });
    return "recovered";
  } catch (err) {
    await remember(videoId, {
      ...state,
      recoveries: MAX_RECOVERIES,
      title: details.title,
      lastError: String(err?.message || err),
    });
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Supporting reads
 * ------------------------------------------------------------------ */

/** Read from GitHub, not the live site — see the note at the top of the file. */
async function isPublished(videoId) {
  try {
    const file = await getFile(INDEX_PATH);
    if (!file || !file.text) return false;
    const index = normalizeIndex(safeJson(file.text));
    return index.videos.some((v) => v.videoId === videoId);
  } catch (err) {
    // An unreadable index must not be mistaken for "never published" — that
    // would trigger a pointless re-analysis of a digest that is already live.
    throw new Error(`Could not read the published index: ${err.message}`);
  }
}

/**
 * The playlist's real name, if this playlist has published before. Otherwise a
 * readable form of the slug, which is a reconstruction rather than a fact — so
 * it is only ever used on a recovered draft you are going to review anyway.
 */
async function playlistNameFor(slug) {
  if (!slug) return "";
  try {
    const file = await getFile(INDEX_PATH);
    const index = normalizeIndex(safeJson(file?.text));
    const known = index.playlists?.[slug]?.name;
    if (known) return known;
  } catch {
    // fall through to the reconstruction
  }
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/* ------------------------------------------------------------------ *
 * Watchdog state
 * ------------------------------------------------------------------ */

async function remember(videoId, state) {
  try {
    await getStore(WATCHDOG_STORE).setJSON(videoId, state);
  } catch (err) {
    console.warn("Could not record watchdog state:", err.message);
  }
}

async function forget(videoId) {
  try {
    await getStore(WATCHDOG_STORE).delete(videoId);
  } catch {
    // Nothing to clear, or the store is unreachable. Neither is worth failing
    // a healthy check over.
  }
}

async function notify(text) {
  if (!process.env.TELEGRAM_CHAT_ID || !process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    await sendMessage(process.env.TELEGRAM_CHAT_ID, text);
  } catch (err) {
    console.error("Watchdog could not reach Telegram:", err.message);
  }
}
