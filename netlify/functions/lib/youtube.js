/**
 * Creator avatars, resolved from YouTube's official Data API.
 *
 * The same rule the rest of the pipeline follows applies to faces: a picture
 * attached to a real person's name must be theirs. This resolves the avatar
 * from the creator's own channel and nothing else. No generated portrait, no
 * initials-on-a-circle dressed up to look like a photo, no stock stand-in. If
 * the channel cannot be resolved, the digest simply carries no image and the
 * layout closes up around the gap.
 *
 * Uses the official API rather than scraping a channel page, both because it
 * is the supported path and because YouTube bot-gates page requests from
 * cloud IPs, which is what killed the free transcript source.
 *
 * Environment variables:
 *   YOUTUBE_API_KEY   optional. Without it, avatars are simply absent.
 */

const API = "https://www.googleapis.com/youtube/v3/channels";

/** Pulls a UC… channel id out of the channel URLs this pipeline stores. */
export function channelIdFrom(channelUrl) {
  const m = String(channelUrl || "").match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/);
  return m ? m[1] : "";
}

/**
 * Returns { imageUrl, channelTitle } for a channel, or null.
 *
 * Never throws: an avatar is a nicety, and failing to get one must not take
 * down an analysis run that has already spent a model call.
 */
export async function fetchChannelAvatar(channelUrl) {
  const key = process.env.YOUTUBE_API_KEY;
  const channelId = channelIdFrom(channelUrl);
  if (!key || !channelId) return null;

  try {
    const url = `${API}?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`YouTube channels.list failed (${res.status}) for ${channelId}`);
      return null;
    }

    const data = await res.json();
    const snippet = data?.items?.[0]?.snippet;
    if (!snippet) return null;

    // Prefer the largest YouTube offers; these are a few hundred pixels at
    // most, so the biggest is still small enough to use directly.
    const thumbs = snippet.thumbnails || {};
    const imageUrl = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";
    if (!imageUrl) return null;

    return { imageUrl, channelTitle: snippet.title || "" };
  } catch (err) {
    console.warn("Could not resolve a channel avatar:", err.message);
    return null;
  }
}
