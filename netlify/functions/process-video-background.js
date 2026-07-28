/**
 * Background variant of process-video.
 *
 * Netlify caps synchronous functions at 10s by default (26s maximum on paid
 * plans). A long transcript plus two Grok calls plus the GitHub commits can run
 * well past that. Functions whose filename ends in `-background` get up to 15
 * minutes instead — they return 202 immediately and finish the work off-request.
 *
 * Point Make at this endpoint:
 *   https://aicreatordigest.com/.netlify/functions/process-video-background
 *
 * Trade-off: a background function answers 202 with an empty body, so Make
 * won't see the result of the run. Check the Netlify function log if something
 * looks wrong. Use the synchronous /api/process-video endpoint when you're
 * testing and want the response.
 */

export { handler } from "./process-video.js";
