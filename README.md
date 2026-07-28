# AI Creator Digest

**[aicreatordigest.com](https://aicreatordigest.com)**

I'm Chris Gallego. I watch the best YouTube channels in AI, tech, SaaS and web design and turn
each video into a digest — read instead of watched. Every digest credits the creator and links
straight back to the original video and channel.

This repository is the whole publication: the content, the pipeline that writes it, and the site
that serves it. It's public because the point is to send people to the creators, not to keep
anything to myself.

---

## For creators

**If you're one of the creators featured here, this was built to send traffic to you.**

Every digest on the site:

- Names you at the top of the page, above the content
- Links your channel and the original video prominently — top *and* bottom
- Preserves your actual language, your frameworks, and your numbers rather than paraphrasing them away
- Gets you a permanent profile page collecting every video of yours I've covered
- Credits you inside the consensus guides, next to the specific ideas you contributed

I don't host your video, I don't transcribe it for people to read instead of watching, and I don't
compete with your channel. The digest is an index that points at you.

**Want something changed?** Open an issue and tag it `creator-request`. Corrections, reframings,
a different name on your profile, or full removal of your videos from the site — all handled
promptly, no argument. This only works if creators are glad it exists.

→ [Open an issue](https://github.com/crgallego/aicreatordigest/issues/new)

---

## What's in here

```
playlists/
  premium-websites/
    index.md              consensus guide, synthesized across every video in the collection
    videos/
      how-some-web-designers-charge-100x-more.md
  outbound/
    index.md
    videos/
creators/
  flux-academy.md         one profile per creator, aggregated across every collection
pages/
  about.md                the About page's copy
  how-we-synthesize.md    the methodology page's copy
web/
  index.html              homepage
  playlists.html          every collection
  playlist.html           one collection: consensus guide + video list       (/playlist/:slug)
  digests.html            every video, searchable
  video.html               one digest                                        (/video/:playlist/:slug)
  creators.html           every creator
  creator.html            one creator profile                                (/creator/:slug)
  about.html
  how-we-synthesize.html
  404.html
  assets/style.css        design tokens — minimalist, hairline dividers, Inter, no frameworks
  assets/app.js           frontmatter parser, row renderers, router, SEO — no frameworks, no build step
  data/index.json         the site manifest, rewritten by the pipeline on every run
netlify/
  functions/process-video.js             the pipeline
  functions/process-video-background.js  same pipeline, 15-minute budget
netlify.toml
sitemap.xml               regenerated on every run
feed.xml                  RSS, regenerated on every run
```

Every digest, consensus guide, and creator profile is a markdown file in this repo. All the
structured content — key points, tactics, quotes, agree/disagree — lives as JSON in that file's
frontmatter, which is what the web app actually renders from. The markdown body underneath it is a
plain-language write-up kept only so the file is worth reading directly on GitHub; the site never
parses it.

---

## How it works

```
YouTube playlist
      │  Make watches for new videos
      ▼
  transcript fetch
      │  HTTP POST
      ▼
Netlify function ──► xAI Grok 4.5 ──► structured digest (JSON)
      │
      ├─► playlists/<slug>/videos/<video>.md    the digest
      ├─► playlists/<slug>/index.md             the consensus guide, re-synthesized
      ├─► creators/<creator>.md                 the profile, regenerated
      ├─► web/data/index.json                   the manifest the site reads
      ├─► sitemap.xml
      └─► feed.xml
             │  GitHub Contents API
             ▼
        commit to main ──► Netlify deploys ──► aicreatordigest.com
```

Two model calls per video. The first turns the transcript into a structured digest: one key
takeaway, a handful of key points (a short title plus 1–3 sentences, in the creator's own language
and numbers), named tactics with a short `kind` label, and a couple of quotes worth keeping
verbatim — with a timestamp only when one is genuinely discoverable in the transcript, never
invented. The second re-synthesizes the whole collection's consensus guide: what these creators
agree on, and — just as importantly — where they genuinely differ. Creator profiles are rebuilt
from the manifest without a model call.

The front end is vanilla HTML, CSS and JavaScript. It fetches one JSON manifest plus the
frontmatter of whatever markdown file the current page needs, renders it client-side, and sets its
own meta tags, canonical URL and JSON-LD. No framework, no bundler, no build step.

### The payload

`POST /api/process-video`

```json
{
  "videoId": "abc123",
  "videoUrl": "https://www.youtube.com/watch?v=abc123",
  "videoTitle": "Video Title",
  "channelName": "Flux Academy",
  "channelUrl": "https://www.youtube.com/@FluxAcademy",
  "transcript": "full transcript text here...",
  "playlistId": "PL-xxxxx",
  "playlistName": "Premium Websites",
  "playlistSlug": "premium-websites",
  "videoDuration": "34:12"
}
```

`videoId`, `videoTitle`, `channelName` and `transcript` are required. `videoDuration` is optional —
pass a human-readable runtime (e.g. from the YouTube Data API's `contentDetails.duration`,
formatted as `M:SS` or `H:MM:SS`) if you have it, and it'll show up in the credit block and footer
meta. Leave it out entirely if you don't; nothing gets fabricated in its place. Everything else is
derived if it's missing. Re-sending a video you've already processed updates its page in place
rather than creating a duplicate.

### Environment variables

| Variable | Required | What it's for |
| --- | --- | --- |
| `XAI_API_KEY` | yes | xAI Grok 4.5 |
| `GITHUB_TOKEN` | yes | fine-grained PAT with **Contents: read and write** on this repo |
| `GITHUB_REPO` | yes | `crgallego/aicreatordigest` |
| `GITHUB_BRANCH` | no | defaults to `main` |
| `MAKE_WEBHOOK_SECRET` | no, but set it | when present, requests must send a matching `x-webhook-secret` header |
| `SITE_URL` | no | defaults to `https://aicreatordigest.com` |

Without `MAKE_WEBHOOK_SECRET` the endpoint is open to anyone who finds the URL, and every call
spends model tokens and writes a commit. Set it.

### Endpoints

| Endpoint | Timeout | Returns |
| --- | --- | --- |
| `/api/process-video` | Netlify's synchronous limit (10s default, 26s max) | the full result — good for testing |
| `/.netlify/functions/process-video-background` | 15 minutes | `202` immediately, result only in the logs |

Long transcripts plus two model calls routinely run past the synchronous limit, so the background
endpoint is the one to point Make at in production.

---

## Editorial standards

Every generated page follows the same rules, enforced in the prompts:

- Direct and specific — like a sharp trade newsletter, not a gushing review blog
- Preserve the creator's own language, numbers, and named frameworks instead of flattening them into generic advice
- Credit the creator by name, and never write a takedown of one
- When creators in the same collection genuinely disagree, say so plainly — that's what "Open Disagreements" is for, not something to paper over
- Never fabricate a fact, number, quote, or timestamp. If it's not in the source material, the field is left empty

If a page invents a number or a timestamp that isn't in the transcript, that's a bug. Open an
issue.

---

## Running it locally

```bash
npm install
npm run dev
```

`netlify dev` serves the site at `http://localhost:8888` with clean URLs and runs the function
locally. Put your keys in a `.env` file first (it's gitignored):

```
XAI_API_KEY=...
GITHUB_TOKEN=...
GITHUB_REPO=crgallego/aicreatordigest
GITHUB_BRANCH=main
MAKE_WEBHOOK_SECRET=...
```

Send a test video through:

```bash
curl -X POST http://localhost:8888/api/process-video \
  -H "content-type: application/json" \
  -H "x-webhook-secret: $MAKE_WEBHOOK_SECRET" \
  -d @test-payload.json
```

Heads up: a local run still commits to the real repo. Point `GITHUB_BRANCH` at a scratch branch
while you're experimenting.

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
