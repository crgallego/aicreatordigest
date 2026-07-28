## Why I'm writing this down

Most "how I built this" posts get written after the fact, once every decision looks obvious in hindsight. This one isn't that. It's the actual sequence: what I got right the first time, what I got wrong and had to redo, and the two moments where I changed my mind about how the whole thing should work.

## The shape of it

AI Creator Digest is a pipeline before it's a website. A Make.com scenario watches YouTube playlists, pulls the transcript when a new video shows up, and hands it to a Netlify function. That function sends the transcript to xAI's Grok, gets back a structured digest, and commits the result as a markdown file to a public GitHub repo. The site itself is vanilla HTML, CSS, and JavaScript reading those markdown files directly, no framework, no build step. Every digest, every consensus guide, every creator profile: a file in git, not a row in a database.

That part of the design didn't change. What changed was almost everything downstream of it.

## The redesign nobody planned for

The first version worked. Then a full visual design handoff came in mid-build, a genuinely different aesthetic: minimalist, warm, hairline dividers instead of cards, a rust accent instead of purple. Taking it seriously meant more than swapping a stylesheet. The new design's centerpiece was a consensus guide built around "where creators agree" and "where they genuinely disagree," which meant the underlying content model had to change too, not just the CSS. Key points went from flat bullet lists to structured title-and-body pairs. Tactics got a category label. The whole markdown schema got rebuilt so the frontmatter carried the real structured data and the body became a plain-language doc for anyone reading the file straight on GitHub. It was a full afternoon of work that looked, from the outside, like "changing the colors."

## Finding out the free way doesn't always work

Every transcript needs to come from somewhere. Paid APIs exist for this, but there's also a free path: the same public caption endpoint YouTube's own player calls, wrapped in a small open-source library. Free is appealing, so I built it first and tested it, not just in theory but against the actual live production function once it was deployed.

It worked on the first video. It got blocked on the second. It worked on the third. Three real attempts, two different outcomes, right there in the logs. That's not a hypothetical risk in a README, that's a measured fact about how Netlify's shared IP ranges look to YouTube's bot detection. I wrote it up exactly that plainly instead of either overselling "it's free!" or underselling "it's unreliable, don't bother."

## The wrong YouTube account

Before any of the playlist automation could go live, I needed to know which actual playlists were feeding the system. The first account I checked had two empty default playlists and nothing else, a channel from a completely different project. The real curated playlists, twenty-two of them, spanning AI tooling, sales prospecting, web design, and a half-dozen other categories, were sitting in a different Google account entirely. Small thing, but it's the kind of detail that would have quietly broken the whole pipeline if I'd assumed instead of checking.

## The pivot that mattered most

The original plan had no human review step. Analyze, publish, done. That changed when the idea of Telegram approval came up: a message with the digest's takeaway and an Approve or Reject button before anything goes live.

The first design for that had the review content living inside Telegram itself, cramped into a 4096-character message. Better, but still limited. Then came the real question: "once it is edited and published, the published version on git isn't synced to the google doc right?" That single question forced a clean answer, no, it's a one-time pull, and it exposed that a Google Doc as the actual editable surface, not just a read-only preview, was the better design. Then came the pivot that actually reshaped the architecture: "I may want to edit the AI analysis." Not just add a comment next to it. Rewrite it.

That meant the AI's output couldn't be the final word. It had to become a draft, held in storage, reconstructable from whatever a human left in the doc, with edits winning outright over the original wherever they existed. The pipeline got split into two phases, analyze and publish, so a video could sit in review for as long as it needed to before anything touched the live site.

## What actually shipped

A shared library holds the analysis and publishing logic. One function analyzes a transcript and stores the draft. A second builds the Google Doc content and sends the Telegram card. A third reads back whatever's in the doc at approval time, a plain-text template with clearly marked sections, parses it, and republishes only what's there: an emptied section means "leave this out," not "fall back to the AI version." A fourth handles rejection cleanly, nothing ever gets committed if a draft doesn't get approved.

Along the way I found and fixed a couple of real bugs myself: a markdown renderer that would swallow a literal number if it happened to sit next to a code span, reintroduced once by copy-paste after I'd already fixed it the first time, and an error classifier for the transcript fetcher that was checking for the wrong exact wording until a live test against a real deleted video caught it.

## What I'd tell someone building something similar

Test the risky assumption for real before you build around it. "Free" and "reliable" are different claims, and the only way to know which one you're actually getting is to hit production with it. Ask where the data really lives before automating around it. And when someone tells you they want to edit the AI's output, believe them literally, don't build a system that only lets them comment on the margins.

This project is still growing. The consensus guides get rewritten every time a playlist gets a new video. The playlist list itself is a living registry, not a fixed set. This page will probably need an update before too long, and when it does, I'll write that down too.
