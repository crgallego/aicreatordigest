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

const CHANNELS_API = "https://www.googleapis.com/youtube/v3/channels";
const VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";

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
    const url = `${CHANNELS_API}?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(key)}`;
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

/**
 * Returns { title, description, channelId, channelTitle, channelUrl } or null.
 *
 * Used only by the watchdog, to rebuild the metadata of a video whose analysis
 * was lost in transit. Make deletes the candidate record the moment it fires
 * the analysis, so by the time anything notices the loss, the title and channel
 * are gone with it. YouTube is the one place they can still be recovered from
 * a bare video id — and recovering them is what makes an automatic retry
 * possible instead of just an apology.
 */
export async function fetchVideoDetails(videoId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !videoId) return null;

  try {
    const url = `${VIDEOS_API}?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`YouTube videos.list(snippet) failed (${res.status}) for ${videoId}`);
      return null;
    }

    const snippet = (await res.json())?.items?.[0]?.snippet;
    if (!snippet) return null;

    const channelId = snippet.channelId || "";
    return {
      title: snippet.title || "",
      description: snippet.description || "",
      channelId,
      channelTitle: snippet.channelTitle || "",
      channelUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : "",
    };
  } catch (err) {
    console.warn("Could not resolve video details:", err.message);
    return null;
  }
}

/**
 * Whether a video may be embedded on another site.
 *
 * Returns true only when YouTube explicitly says so. A missing key, a failed
 * lookup, or a video we cannot find all return false, because the cost of
 * being wrong is asymmetric: refusing to embed an embeddable video loses a
 * convenience, while embedding a video whose owner disallowed it puts a
 * permanent "Video unavailable" box in the middle of the digest.
 */
export async function fetchVideoEmbeddable(videoId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !videoId) return false;

  try {
    const url = `${VIDEOS_API}?part=status&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`YouTube videos.list failed (${res.status}) for ${videoId}`);
      return false;
    }
    const data = await res.json();
    const status = data?.items?.[0]?.status;
    return status?.embeddable === true;
  } catch (err) {
    console.warn("Could not check embeddability:", err.message);
    return false;
  }
}
