/* Timestamps are resolved by matching a verbatim anchor against timed caption
 * segments, never supplied by the model. These tests pin both halves of that:
 * a real phrase resolves to the right second, and anything that cannot be
 * located stays empty rather than being approximated. */
import assert from "node:assert";
import {
  findTimestamp,
  formatTimestamp,
  timestampUrl,
  resolveTimestamps,
} from "../netlify/functions/lib/timestamps.js";

const segments = [
  { text: "Hey everyone, Ran Segall here.", start: "0.0", dur: "3.0" },
  { text: "Most web designers quote hourly and stay poor.", start: "12.5", dur: "4.0" },
  { text: "I raised my minimum from three thousand", start: "48.2", dur: "3.0" },
  { text: "to twelve thousand dollars by selling outcomes.", start: "51.4", dur: "3.5" },
  { text: "That single change rebuilt the business.", start: "3675.0", dur: "3.0" },
];

/* ===================== locating a phrase ===================== */

assert.equal(
  findTimestamp(segments, "Most web designers quote hourly and stay poor"),
  12,
  "an exact phrase resolves to the second its segment began"
);

// Punctuation and casing must not matter; captions and quotes rarely agree.
assert.equal(
  findTimestamp(segments, "most web designers QUOTE HOURLY, and stay poor!!"),
  12,
  "matching ignores case and punctuation"
);

// A phrase spanning a segment boundary still resolves, to the segment it began in.
assert.equal(
  findTimestamp(segments, "I raised my minimum from three thousand to twelve thousand dollars"),
  48,
  "a phrase spanning two segments resolves to where it started"
);

// Light cleanup at the tail should still find the opening.
assert.equal(
  findTimestamp(segments, "Most web designers quote hourly and stay broke forever honestly"),
  12,
  "a lightly reworded tail still matches on the verbatim opening"
);

console.log("findTimestamp: OK — exact, punctuation-insensitive, boundary-spanning, tolerant of tail edits");

/* ===================== refusing to guess ===================== */

assert.equal(
  findTimestamp(segments, "nothing in this sentence appears in the captions at all"),
  null,
  "an absent phrase yields no timestamp"
);
assert.equal(findTimestamp(segments, "the"), null, "too short to be distinctive yields nothing");
assert.equal(findTimestamp([], "Most web designers quote hourly"), null, "no segments yields nothing");
console.log("findTimestamp: OK — refuses to guess rather than approximating");

/* ===================== formatting and links ===================== */

assert.equal(formatTimestamp(12), "0:12");
assert.equal(formatTimestamp(754), "12:34");
assert.equal(formatTimestamp(3723), "1:02:03");
assert.equal(formatTimestamp(null), "");

assert.equal(
  timestampUrl("https://www.youtube.com/watch?v=abc123", "abc123", 754),
  "https://www.youtube.com/watch?v=abc123&t=754s",
  "an existing query string gets an ampersand"
);
assert.equal(
  timestampUrl("", "abc123", 12),
  "https://www.youtube.com/watch?v=abc123&t=12s",
  "a bare video id still produces a usable link"
);
console.log("formatTimestamp/timestampUrl: OK");

/* ===================== resolving a whole analysis ===================== */

const shaped = resolveTimestamps(
  {
    keyPoints: [
      { title: "Hourly caps you", body: "…", anchor: "Most web designers quote hourly and stay poor" },
      { title: "Unlocatable", body: "…", anchor: "a phrase that simply is not present anywhere" },
    ],
    tactics: [{ title: "Raise the floor", body: "…", anchor: "I raised my minimum from three thousand" }],
    quotes: [
      { text: "That single change rebuilt the business." },
      { text: "Something he never actually said on camera at any point." },
    ],
  },
  { segments, videoUrl: "https://www.youtube.com/watch?v=abc123", videoId: "abc123" }
);

assert.equal(shaped.keyPoints[0].at, "0:12");
assert.equal(shaped.keyPoints[0].atUrl, "https://www.youtube.com/watch?v=abc123&t=12s");
assert.equal(shaped.keyPoints[1].at, undefined, "an unlocatable point gets no timestamp at all");
assert.equal(shaped.tactics[0].at, "0:48");

// A quote is its own anchor, being verbatim by definition.
assert.equal(shaped.quotes[0].at, "1:01:15", "a quote past an hour formats with hours");
assert.equal(shaped.quotes[1].at, undefined, "an unlocatable quote gets no timestamp");
console.log("resolveTimestamps: OK — links only where the phrase is genuinely in the captions");

console.log("\nALL TIMESTAMP TESTS PASSED");
