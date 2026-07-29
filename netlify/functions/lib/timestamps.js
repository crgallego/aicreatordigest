/**
 * Resolving passages back to their moment in the source video.
 *
 * The model is never asked for a timestamp and never could answer honestly:
 * the transcript it receives is flattened plain text with no timing in it at
 * all, which is why the quote timestamp field sat empty on every digest.
 *
 * Instead the model marks an `anchor` — a short verbatim phrase it is drawing
 * from — and that phrase is matched deterministically against the timed
 * caption segments here. A match yields a real second offset. No match yields
 * nothing, the same rule the rest of the pipeline follows: a gap, never a
 * guess. Nobody can hallucinate their way into a wrong link this way.
 */

/** Lowercase, strip anything that isn't a letter, digit or space, collapse runs. */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds a searchable haystack from timed segments, keeping a map from each
 * character offset back to the second the containing segment began.
 */
function buildIndex(segments) {
  let haystack = "";
  const offsets = []; // offsets[i] = seconds at which character i was spoken

  for (const seg of segments || []) {
    const piece = normalize(seg && seg.text);
    if (!piece) continue;
    const startSeconds = Number.parseFloat(seg.start);
    if (!Number.isFinite(startSeconds)) continue;

    if (haystack) {
      haystack += " ";
      offsets.push(startSeconds);
    }
    haystack += piece;
    for (let i = 0; i < piece.length; i++) offsets.push(startSeconds);
  }

  return { haystack, offsets };
}

/**
 * Finds the second at which `phrase` was spoken, or null.
 *
 * Tries the whole phrase first, then progressively shorter openings, because
 * a quote may carry light cleanup (filler words removed) that breaks an exact
 * match while its opening words remain verbatim. Below six words the risk of
 * matching a coincidental phrase outweighs the value of a link, so it stops.
 */
export function findTimestamp(segments, phrase, index) {
  const { haystack, offsets } = index || buildIndex(segments);
  const needle = normalize(phrase);
  if (!haystack || needle.length < 12) return null;

  let at = haystack.indexOf(needle);
  if (at === -1) {
    const words = needle.split(" ");
    for (let take = Math.min(words.length, 12); take >= 6; take--) {
      at = haystack.indexOf(words.slice(0, take).join(" "));
      if (at !== -1) break;
    }
  }
  if (at === -1) return null;

  const seconds = offsets[at];
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : null;
}

/** Seconds to "12:34" or "1:02:03". */
export function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

/** A watch URL that starts playing at the given second. */
export function timestampUrl(videoUrl, videoId, seconds) {
  if (!Number.isFinite(seconds)) return "";
  const base = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
  if (!base) return "";
  return `${base}${base.includes("?") ? "&" : "?"}t=${Math.floor(seconds)}s`;
}

/**
 * Fills `atSeconds`, `at` and `atUrl` on every quote, key point and tactic
 * that can be located in the transcript. Anything unmatched is left without a
 * timestamp rather than given an approximate one.
 */
export function resolveTimestamps(shaped, { segments, videoUrl, videoId }) {
  if (!Array.isArray(segments) || !segments.length) return shaped;
  const index = buildIndex(segments);

  const locate = (phrase) => {
    const seconds = findTimestamp(null, phrase, index);
    if (seconds === null) return {};
    return { atSeconds: seconds, at: formatTimestamp(seconds), atUrl: timestampUrl(videoUrl, videoId, seconds) };
  };

  return {
    ...shaped,
    // A quote is verbatim by definition, so it is its own anchor.
    quotes: (shaped.quotes || []).map((q) => ({ ...q, ...locate(q.anchor || q.text) })),
    keyPoints: (shaped.keyPoints || []).map((p) => ({ ...p, ...locate(p.anchor) })),
    tactics: (shaped.tactics || []).map((t) => ({ ...t, ...locate(t.anchor) })),
  };
}
