# AI Creator Digest

**[aicreatordigest.com](https://aicreatordigest.com)** — currently served from
[remarkable-figolla-6d707e.netlify.app](https://remarkable-figolla-6d707e.netlify.app) while the
custom domain is connected.

I'm Chris Gallego. I watch the best YouTube channels in AI, tech, SaaS and web design and turn
each video into a digest — read instead of watched. Every digest credits the creator and links
straight back to the original video and channel.

This repository is the whole publication: the content, the pipeline that writes it, and the site
that serves it. It's public because the point is to send people to the creators, not to keep
anything to myself.

> **Status: built, not yet publishing.** The full pipeline — discovery, triage, transcript,
> analysis, review, preview, publish — is implemented, tested and deployed, and has not yet been
> run end to end against a real video. There are currently **zero digests**. Everything below
> describes how the system works, not how much it has produced.

---

## For creators

**If you're one of the creators featured here, this was built to send traffic to you.**

Every digest the pipeline produces:

- Names you at the top of the page, above the content
- Links your channel and the original video prominently — top *and* bottom
- Preserves your actual language, your frameworks, and your numbers rather than paraphrasing them away
- Gets you a permanent profile page collecting every video of yours I've covered
- Credits you inside the consensus guides, next to the specific ideas you contributed
- Links your social profiles in a Connect section — **only** the ones written in your video's own
  description. No handle is ever guessed by a model. See [Editorial standards](#editorial-standards).

I don't host your video, I don't transcribe it for people to read instead of watching, and I don't
compete with your channel. The digest is an index that points at you.

**Want something changed?** Open an issue and tag it `creator-request`. Corrections, reframings,
a different name on your profile, or full removal of your videos from the site — all handled
promptly, no argument. This only works if creators are glad it exists.

→ [Open an issue](https://github.com/crgallego/aicreatordigest/issues/new)

---

## What's in here

```
playlists/                  one directory per collection, created on first publish
  <playlist-slug>/
    index.md                consensus guide, synthesized across every video in the collection
    videos/<video-slug>.md  one digest
creators/<creator-slug>.md  one profile per creator, aggregated across every collection
pages/
  about.md                  the About page's copy
  how-we-synthesize.md      the methodology page's copy
  how-this-works.md         the build story
  chris-gallego.md          author page
web/
  index.html                homepage
  playlists.html            every collection
  playlist.html             one collection: consensus guide + video list       (/playlist/:slug)
  digests.html              every video, searchable
  video.html                one digest  (/video/:playlist/:slug)  — and ALSO the
                            unpublished-draft preview at /preview?token=…
  creators.html             every creator
  creator.html              one creator profile                                (/creator/:slug)
  review.html               the Telegram Mini App review editor                (/review/:draftKey)
  about.html  how-we-synthesize.html  how-this-works.html  chris-gallego.html  404.html
  assets/style.css          design tokens — minimalist, hairline dividers, Inter, no frameworks
  assets/app.js             frontmatter parser, row renderers, router, SEO — no build step
  data/index.json           the site manifest, rewritten by the pipeline on every publish
netlify/functions/
  fetch-transcript.js       transcript for one video, no key required
  analyze-video.js          analyze → store a draft in Netlify Blobs (publishes nothing)
  notify-draft.js           send the Telegram draft card
  review-api.js             the Mini App's backend: load, save, publish, reject
  preview-markdown.js       a draft rendered exactly as it would be published
  publish-video.js          publish a stored draft as-is (the card's "Publish as-is" shortcut)
  reject-draft.js           discard a draft
  process-video.js          analyze AND publish in one call — bypasses review, for testing
  process-video-background.js  same, with a 15-minute budget
  lib/pipeline.js           analysis, shaping, markdown builders, the GitHub commit cascade
  lib/telegram.js           the Bot API calls this pipeline uses
  lib/webapp-auth.js        Mini App initData verification + preview tokens
test/                       the test suite — see test/README.md
reports/                    build reports
memory/releases/            writing packages: decisions, frameworks, session records
netlify.toml
sitemap.xml  feed.xml       regenerated on every publish
```

Every digest, consensus guide, and creator profile is a markdown file in this repo. All the
structured content — key points, tactics, quotes, agree/disagree — lives as JSON in that file's
frontmatter, which is what the web app actually renders from. The markdown body underneath it is a
plain-language write-up kept only so the file is worth reading directly on GitHub; the site never
parses it.

---

## How it works

Nothing publishes without me. There are two human gates: one deciding what's worth analyzing, and
one deciding what's worth publishing.

```
YouTube playlists (a registry in a Make data store)
      │  one scenario polls the YouTube Data API, once daily
      │  stops adding while 10 candidates are already pending
      ▼
  ┌──────────────── GATE 1: what's worth spending a model call on ───────────────┐
  │  a Telegram card per candidate:  [Process]  [Skip 3d]  [Discard]             │
  └──────────────────────────────────┬──────────────────────────────────────────┘
                                     │ Process
                                     ▼
                             fetch-transcript
                                     │
                                     ▼
                    analyze-video ──► xAI Grok 4.5 ──► draft in Netlify Blobs
                                     │
                                     ▼
                             notify-draft ──► a card with the video's thumbnail:
                                              [📝 Review & edit] [✅ Publish as-is] [❌ Reject]
                                     │
  ┌──────────────────────────────────┴──── GATE 2: what's worth publishing ──────┐
  │  "Review & edit" opens the Mini App (web/review.html) inside Telegram:       │
  │      edit every section  →  PREVIEW  →  publish                              │
  │                                                                              │
  │  The preview is web/video.html itself — the same template, styles and        │
  │  rendering code a published digest uses — pointed at the draft instead of a  │
  │  committed file. What you approve is byte-for-byte what ships, and a test    │
  │  asserts exactly that (npm test).                                            │
  └──────────────────────────────────┬──────────────────────────────────────────┘
                                     │ publish
                                     ▼
      ├─► playlists/<slug>/videos/<video>.md    the digest
      ├─► playlists/<slug>/index.md             the consensus guide, re-synthesized
      ├─► creators/<creator>.md                 the profile, regenerated
      ├─► web/data/index.json                   the manifest the site reads
      ├─► sitemap.xml
      └─► feed.xml
             │  GitHub Contents API
             ▼
        commit to main ──► Netlify deploys ──► the site
```

After a decision the draft is deleted and the Telegram card is removed, leaving a one-line record
in the chat. A video can only be published once.

Two model calls per published video. The first turns the transcript into a structured digest: one
key takeaway, a handful of key points (a short title plus 1–3 sentences, in the creator's own
language and numbers), named tactics with a short `kind` label, a couple of quotes worth keeping
verbatim — with a timestamp only when one is genuinely discoverable in the transcript, never
invented — and the names and roles of anyone featured. The second re-synthesizes the whole
collection's consensus guide: what these creators agree on, and where they genuinely differ.
Creator profiles are rebuilt from the manifest without a model call.

The front end is vanilla HTML, CSS and JavaScript. It fetches one JSON manifest plus the
frontmatter of whatever markdown file the current page needs, renders it client-side, and sets its
own meta tags, canonical URL and JSON-LD. No framework, no bundler, no build step.

### The payload

`POST /.netlify/functions/analyze-video` — the entry point for the reviewed path.

```json
{
  "videoId": "abc123",
  "videoUrl": "https://www.youtube.com/watch?v=abc123",
  "videoTitle": "Video Title",
  "videoDescription": "the video's full description text",
  "channelName": "Flux Academy",
  "channelUrl": "https://www.youtube.com/@FluxAcademy",
  "transcript": "full transcript text here...",
  "playlistId": "PL-xxxxx",
  "playlistName": "Premium Websites",
  "playlistSlug": "premium-websites",
  "videoDuration": "34:12"
}
```

`videoId`, `videoTitle`, `channelName` and `transcript` are required. Everything else is derived if
missing, with two worth calling out:

- **`videoDescription`** is the *only* source of social links. Omit it and the digest publishes
  with no Connect section — nothing is looked up or inferred to fill the gap.
- **`videoDuration`** is optional; pass a human-readable runtime (e.g. from the YouTube Data API's
  `contentDetails.duration`, formatted as `M:SS` or `H:MM:SS`) and it appears in the credit block
  and footer meta. Leave it out and nothing is fabricated in its place.

Re-publishing a video you've already published updates its page in place rather than creating a
duplicate. Both JSON and form-urlencoded bodies are accepted — Make sends the latter, to avoid
hand-rolling JSON escaping for transcripts.

### Environment variables

| Variable | Required | What it's for |
| --- | --- | --- |
| `XAI_API_KEY` | yes | xAI Grok 4.5 |
| `GITHUB_TOKEN` | yes | fine-grained PAT with **Contents: read and write** on this repo |
| `GITHUB_REPO` | yes | `crgallego/aicreatordigest` |
| `TELEGRAM_BOT_TOKEN` | yes | the draft cards, and the signing key for Mini App auth and preview tokens |
| `TELEGRAM_CHAT_ID` | yes | where cards go, and the only account allowed to use the review editor |
| `GITHUB_BRANCH` | no | defaults to `main` |
| `MAKE_WEBHOOK_SECRET` | no, but set it | when present, requests must send a matching `x-webhook-secret` header |
| `SITE_URL` | no | defaults to `https://aicreatordigest.com`; also builds the Mini App's `/review` link, so it must point at the host actually serving the site |

Without `MAKE_WEBHOOK_SECRET` the pipeline endpoints are open to anyone who finds the URL, and
every call spends model tokens and writes a commit. Set it.

`TELEGRAM_BOT_TOKEN` does double duty: the Mini App verifies Telegram's signed launch payload
against it, and preview tokens are signed with it. There's no separate secret to manage.

### Endpoints

| Route | Auth | What it does |
| --- | --- | --- |
| `/api/fetch-transcript` | webhook secret | transcript for one `videoId` |
| `/.netlify/functions/analyze-video` | webhook secret | analyze and store a draft; publishes nothing |
| `/.netlify/functions/notify-draft` | webhook secret | send the Telegram draft card |
| `/.netlify/functions/publish-video` | webhook secret | publish a stored draft as-is |
| `/.netlify/functions/reject-draft` | webhook secret | discard a draft |
| `/api/review` | Telegram initData | the Mini App backend: load, save, publish, reject |
| `/api/preview-markdown` | preview token | a draft rendered as it would be published |
| `/review/:draftKey` | page | the Mini App editor |
| `/preview?token=…` | preview token | the real digest template rendering a draft |
| `/api/process-video` | webhook secret | analyze **and** publish immediately — bypasses review |

Only the routes with an `/api/` alias have one; the rest are called at their function paths, which
is what the Make scenarios use. `process-video` and its background twin exist for testing and for
trusted content — nothing in production calls them. The reviewed path is `fetch-transcript` →
`analyze-video` → `notify-draft`, then the Mini App.

---

## Editorial standards

Every generated page follows the same rules, enforced in the prompts and in code:

- Direct and specific — like a sharp trade newsletter, not a gushing review blog
- Preserve the creator's own language, numbers, and named frameworks instead of flattening them into generic advice
- Credit the creator by name, and never write a takedown of one
- When creators in the same collection genuinely disagree, say so plainly — that's what "Open Disagreements" is for, not something to paper over
- Never fabricate a fact, number, quote, or timestamp. If it's not in the source material, the field is left empty
- **Never guess a real person's social profile.** The model may identify *who* appears in a video
  and their role; it may not supply a handle or a URL. Links are pattern-matched from the video's
  own description and re-derived at publish time, so an edited name gets that person's real link or
  none at all. Enforced in `extractSocialLinks`, covered by `test/social-links.test.mjs`.

If a page invents a number, a timestamp, or a link that isn't in the source material, that's a bug.
Open an issue.

---

## Running it locally

```bash
npm install
npm test          # the full offline suite — no network, no credentials
npm run dev       # netlify dev at http://localhost:8888
```

`npm test` runs every suite in its own process and exits non-zero on failure. See
[`test/README.md`](test/README.md) for what's covered — including the assertion that a preview and
its published page are byte-identical, which is what keeps the review step honest.

For `netlify dev`, put your keys in a `.env` file first (it's gitignored):

```
XAI_API_KEY=...
GITHUB_TOKEN=...
GITHUB_REPO=crgallego/aicreatordigest
GITHUB_BRANCH=main
MAKE_WEBHOOK_SECRET=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SITE_URL=http://localhost:8888
```

Send a video through the no-review path:

```bash
curl -X POST http://localhost:8888/api/process-video \
  -H "content-type: application/json" \
  -H "x-webhook-secret: $MAKE_WEBHOOK_SECRET" \
  -d '{"videoId":"abc123","videoTitle":"Test","channelName":"Someone","transcript":"..."}'
```

Heads up: a local run still commits to the real repo. Point `GITHUB_BRANCH` at a scratch branch
while you're experimenting.

The Mini App can't be meaningfully exercised locally — it authenticates with a launch payload only
the Telegram client can sign. `test/review-app.test.mjs` covers that flow by constructing correctly
signed payloads with a throwaway token.

---

## Contributing

Pull requests welcome, especially:

- **Creator requests** — corrections, removals, better framing. Highest priority, always.
- **Front-end polish** — it's vanilla HTML/CSS/JS on purpose. Keep it that way; no frameworks, no
  build step.
- **Prompt improvements** — if a digest loses a creator's specific numbers, flattens their
  framework into generic advice, or invents a timestamp, the prompt needs work.
- **New playlists** — open an issue with the playlist URL and why it belongs here.

Two things I won't merge: a build step, and anything that reduces how prominently creators are
credited.

---

## License

Code is MIT. The digests summarize and quote publicly available videos with attribution and link
back to every original; the underlying ideas belong to the creators who taught them. Creators can
have their content removed on request, no questions asked.
