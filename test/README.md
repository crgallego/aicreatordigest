# Tests

```bash
npm test          # all offline suites — no network, no credentials
npm run test:live # one suite that calls YouTube for real (see below)
```

Every suite runs in its own process so one suite's `fetch` stub or environment
variables can't leak into the next. `npm test` exits non-zero if any suite
fails.

No test framework. These are plain Node scripts using `node:assert`, run by
[`run.mjs`](run.mjs).

## What each suite covers

| Suite | Covers |
| --- | --- |
| `pipeline` | Markdown builders, slug resolution, index merging, sitemap and feed generation |
| `render` | The front end's frontmatter parser and row renderers, against committed fixtures |
| `social-links` | Links come only from the video's description, never from the model |
| `approval-flow` | analyze → notify → publish-as-is, and the reject path |
| `review-app` | The Mini App: load, edit, preview, publish — including preview/publish byte identity |
| `webapp-auth` | Telegram `initData` verification and preview-token signing |

## The one that matters most

`review-app.test.mjs` publishes a draft, renders the same draft through the
preview path, and asserts the two markdown bodies are **byte-identical**:

```js
assert.equal(bodyOf(committed), bodyOf(previewMd),
  "the published page body must be byte-identical to what the preview showed");
```

The review flow's central promise is that what you approve is what ships. That
promise holds because the preview is rendered by the production code path
(`web/video.html` pointed at draft data), not by a second renderer — and this
assertion is what keeps it that way. If someone changes how pages are built and
misses the preview, this fails instead of a reader finding out from a live page.

It has been verified to fail: injecting a single character of drift into
`renderPreviewMarkdown` turns the suite red.

## How the mocks work

The draft-handling functions import `@netlify/blobs`, which only exists inside
Netlify's runtime. [`helpers/register.mjs`](helpers/register.mjs) installs a
module-resolution hook that swaps it for an in-memory stand-in
([`helpers/blobs-mock.mjs`](helpers/blobs-mock.mjs)).

xAI, GitHub and Telegram are stubbed per-suite by replacing `globalThis.fetch`,
so no suite spends model tokens, writes a commit, or sends a message. Suites
that exercise the Mini App build correctly-signed Telegram `initData` with a
throwaway bot token rather than skipping authentication.

## The live suite

`npm run test:live` runs `live-transcript.test.mjs`, which makes a real request
to YouTube for a real video's captions. It is kept out of `npm test` on purpose:
YouTube's bot detection intermittently blocks requests from shared IPs, so it
can fail for reasons that have nothing to do with the code. Run it when changing
`fetch-transcript.js`, and read a failure as "check whether it's a block" rather
than as a regression.

## Adding a suite

Add `test/<name>.test.mjs`, then add `<name>` to the `SUITES` array in
[`run.mjs`](run.mjs). Assert with `node:assert` and let it throw; the runner
treats a non-zero exit as failure and prints the output.
