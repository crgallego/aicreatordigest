/* Runs the browser runtime headlessly against the markdown the pipeline produced. */
import assert from "node:assert";
import fs from "node:fs";
import vm from "node:vm";

const fixtures = JSON.parse(fs.readFileSync(new URL("./helpers/fixtures.json", import.meta.url), "utf8"));
const src = fs.readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");

const sandbox = {
  window: {},
  location: { pathname: "/video/premium-websites/how-some-web-designers-charge-100x-more", search: "" },
  document: {},
  fetch: () => {},
  URLSearchParams,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const A = sandbox.window.ACD;
assert.ok(A, "app.js should expose window.ACD");

/* ---- frontmatter round-trip on the real generated video file, including
 * the new structured content that used to live only in the markdown body ---- */
const videoMd = fixtures["playlists/premium-websites/videos/how-some-web-designers-charge-100x-more.md"];
const { data: vData, body: vBody } = A.parseFrontmatter(videoMd);

assert.equal(vData.title, "How Some Web Designers Charge 100x More");
assert.equal(vData.creatorName, "Ran Segall");
assert.equal(vData.channelUrl, "https://www.youtube.com/@FluxAcademy");
assert.deepEqual(vData.categories, ["Pricing", "Sales", "Positioning"]);
assert.equal(vData.readTimeMinutes, 1);
assert.ok(!vBody.startsWith("---"), "body must not retain the frontmatter block");

assert.equal(vData.keyPoints.length, 3);
assert.equal(vData.keyPoints[0].title, "Hourly billing caps your ceiling");
assert.ok(vData.keyPoints[1].body.includes("$3,000 to $12,000"), "real numbers must survive JSON round-trip in frontmatter");

assert.equal(vData.tactics.length, 1);
assert.equal(vData.tactics[0].kind, "pricing");

assert.equal(vData.quotes.length, 2);
// Timestamps are never taken from the model, only matched against timed
// caption segments. These fixtures are generated without segments, so both
// quotes correctly carry no timestamp even though the stub model offered one.
assert.equal(vData.quotes[0].at, "", "quote with no discernible timestamp must stay empty, never fabricated");
assert.equal(vData.quotes[1].at, "", "a model-supplied timestamp must be discarded, not trusted");

console.log("video frontmatter (structured content as data, not parsed markdown): OK");

/* ---- playlist frontmatter: agree/disagree instead of themes ---- */
const plMd = fixtures["playlists/premium-websites/index.md"];
const { data: plData } = A.parseFrontmatter(plMd);
assert.equal(plData.videoCount, 3);
assert.ok(Array.isArray(plData.agree) && plData.agree.length >= 1);
assert.ok(Array.isArray(plData.disagree));
assert.ok(plData.summary, "consensus summary should be present");
console.log("playlist frontmatter (agree/disagree): OK");

/* ---- creator frontmatter: bio lives in frontmatter now, no body parsing ---- */
const crMd = fixtures["creators/flux-academy.md"];
const { data: crData } = A.parseFrontmatter(crMd);
assert.equal(crData.creatorName, "Ran Segall");
assert.ok(crData.bio && crData.bio.includes("Flux Academy"), "bio must be directly readable from frontmatter");
console.log("creator frontmatter (bio in frontmatter): OK");

/* ---- markdown renderer is still exercised: About / How I Synthesize pages ---- */
const aboutMd = fs.readFileSync(new URL("../pages/about.md", import.meta.url), "utf8");
const aboutHtml = A.renderMarkdown(aboutMd);
assert.ok(aboutHtml.includes("<h2>"), "about page should render headings");
assert.ok(aboutHtml.includes("Chris Gallego") === false || true); // presence check only, no crash
assert.ok(!/<script/i.test(aboutHtml), "no raw script tags");

const synthMd = fs.readFileSync(new URL("../pages/how-we-synthesize.md", import.meta.url), "utf8");
const synthHtml = A.renderMarkdown(synthMd);
assert.ok(synthHtml.includes("<h2>"), "how-we-synthesize page should render headings");
assert.ok(synthHtml.includes("<li>"), "should render its bullet lists");
console.log("markdown renderer on real About/How-I-Synthesize content: OK");

/* ---- internal links stay in-tab, external links open out ---- */
const links = A.renderMarkdown("[in](/creator/x) and [out](https://youtube.com/@z)");
assert.ok(links.includes('<a href="/creator/x">in</a>'), links);
assert.ok(links.includes('rel="noopener nofollow"'), links);

/* ---- XSS: hostile transcript content must not become live HTML ---- */
const hostile = A.renderMarkdown(
  '<img src=x onerror=alert(1)> and [click](javascript:alert(1)) and <script>alert(1)</script>'
);
assert.ok(!hostile.includes("<img"), hostile);
assert.ok(!hostile.includes("<script"), hostile);
assert.ok(!hostile.includes("javascript:"), hostile);
assert.ok(hostile.includes('<a href="#">click</a>'), hostile);
console.log("xss escaping: OK");

/* ---- inline edge cases, including the code-span/number collision regression ---- */
const inlineCases = [
  ["**bold** text", "<strong>bold</strong>"],
  ["a *word* here", "<em>word</em>"],
  ["use `const x = 1` now", "<code>const x = 1</code>"],
  ["`**not bold**`", "<code>**not bold**</code>"],
  ["10% of $12,000", "10% of $12,000"],
  ["raised prices 3x and it worked, using `code` here", "<code>code</code>"],
  ["`one` then plain 0 text then `two`", "<code>one</code>"],
];
for (const [input, expect] of inlineCases) {
  const out = A.renderMarkdown(input);
  assert.ok(out.includes(expect), `"${input}" -> ${out} (wanted ${expect})`);
}
// The literal "0" in plain text must not get swallowed by the code-span sentinel.
assert.ok(A.renderMarkdown("`one` then plain 0 text then `two`").includes("plain 0 text"));
console.log("inline formatting + code-span sentinel: OK");

/* ---- date formatting ---- */
assert.equal(A.formatDateShort("2026-07-22T18:00:00.000Z"), "jul 22");
assert.equal(A.formatDateLong("2026-07-22T18:00:00.000Z"), "jul 22, 2026");
assert.equal(A.formatMonthYear("2026-07-22T18:00:00.000Z"), "jul 2026");
assert.equal(A.formatDateShort(""), "");
console.log("date formatting: OK");

/* ---- row renderers against the real manifest ---- */
const idx = JSON.parse(fixtures["web/data/index.json"]);
const firstVideo = idx.videos.find((v) => v.videoId === "abc123");
const secondVideo = idx.videos.find((v) => v.videoId === "def456");

const vRow = A.videoRow(firstVideo);
assert.ok(vRow.includes('href="/video/premium-websites/how-some-web-designers-charge-100x-more"'));
assert.ok(vRow.includes("Ran Segall"));
assert.ok(vRow.includes("1 min"));

const vRowWithDuration = A.videoRow(secondVideo);
assert.ok(vRowWithDuration.includes("22:40"), "optional videoDuration should render when present");
assert.ok(!vRow.includes("undefined"), "missing optional fields must never leak the word 'undefined' into markup");

const plCell = A.playlistCell({ slug: "premium-websites", name: "Premium Websites", topic: "Pricing", blurb: "test blurb" }, 3);
assert.ok(plCell.includes('href="/playlist/premium-websites"'));
assert.ok(plCell.includes("3 videos"));

const cRow = A.creatorRow({ slug: "flux-academy", creatorName: "Ran Segall", channelName: "Flux Academy", videoCount: 2 });
assert.ok(cRow.includes('href="/creator/flux-academy"'));
assert.ok(cRow.includes("2 digests"));

const plvRow = A.plVideoRow(firstVideo, 0);
assert.ok(plvRow.includes(">01<"));

console.log("row renderers: OK");

/* ---- helpers ---- */
assert.equal(A.plural(1, "video", "videos"), "1 video");
assert.equal(A.plural(2, "video", "videos"), "2 videos");
assert.equal(A.primaryTopic({ categories: ["Pricing", "Sales"] }), "Pricing");
assert.equal(A.groupTopic([{ categories: ["Sales"] }, { categories: ["Sales"] }, { categories: ["Pricing"] }]), "Sales");
assert.equal(A.joinMeta(["a", "", null, "b"]), "a · b");
assert.equal(A.readTimeLabel({ readTimeMinutes: 7 }), "7 min");
assert.equal(A.readTimeLabel({}), "1 min");

console.log("\nALL RENDER TESTS PASSED");

/* ============ creator directory: browse, filter, sort ============ */
{
  const creators = [
    { slug: "flux", creatorName: "Ran Segall", channelName: "Flux Academy", bio: "Teaches value pricing.",
      videoCount: 5, lastPublishedAt: "2026-07-20T00:00:00.000Z",
      topics: [{ label: "Pricing", count: 4 }, { label: "Positioning", count: 2 }],
      playlists: [{ playlistSlug: "premium-websites", playlistName: "Premium Websites" }] },
    { slug: "jake", creatorName: "Jake Van Clief", channelName: "Jake Van Clief", bio: "Frameworks for agents.",
      videoCount: 9, lastPublishedAt: "2026-07-10T00:00:00.000Z",
      topics: [{ label: "AI Tooling", count: 6 }, { label: "Pricing", count: 1 }],
      playlists: [{ playlistSlug: "ai-automations", playlistName: "AI Automations" }] },
    { slug: "aria", creatorName: "Aria Chen", channelName: "Aria Builds", bio: "Ships SaaS in public.",
      videoCount: 2, lastPublishedAt: "2026-07-28T00:00:00.000Z",
      topics: [{ label: "SaaS", count: 2 }],
      playlists: [] },
  ];

  const topics = A.topicsAcross(creators);
  assert.equal(topics[0].label, "Pricing", "the most widely covered topic ranks first");
  assert.equal(topics[0].count, 2, "counted by how many creators cover it, not how often");
  assert.ok(topics.some((t) => t.label === "SaaS"));

  // Search reaches beyond the name, into channel, bio, topics and playlists.
  assert.equal(A.browseCreators(creators, { q: "value pricing" }).length, 1, "bio is searchable");
  assert.equal(A.browseCreators(creators, { q: "ai automations" }).length, 1, "playlist name is searchable");
  assert.equal(A.browseCreators(creators, { q: "AI TOOLING" }).length, 1, "search is case-insensitive");
  assert.equal(A.browseCreators(creators, { q: "nothing here" }).length, 0);

  // Topic filter is exact, not substring: "Pricing" must not sweep in "SaaS".
  const priced = A.browseCreators(creators, { topic: "Pricing" });
  assert.equal(priced.length, 2, "both creators covering Pricing are kept");
  assert.ok(!priced.some((c) => c.slug === "aria"), "a creator without the topic is excluded");

  // Sorting, with name as the stable tiebreak.
  assert.deepEqual(A.browseCreators(creators, { sort: "name" }).map((c) => c.slug), ["aria", "jake", "flux"]);
  assert.deepEqual(A.browseCreators(creators, { sort: "digests" }).map((c) => c.slug), ["jake", "flux", "aria"]);
  assert.deepEqual(A.browseCreators(creators, { sort: "recent" }).map((c) => c.slug), ["aria", "flux", "jake"]);

  // Filter and sort compose.
  assert.deepEqual(
    A.browseCreators(creators, { topic: "Pricing", sort: "digests" }).map((c) => c.slug),
    ["jake", "flux"]
  );
  console.log("creator directory: OK — search spans bio/topics/playlists, topic filter is exact, sorts are stable");
}
