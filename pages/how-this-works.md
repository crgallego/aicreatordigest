## Why I'm writing this down

Most "how I built this" posts get written after the fact, once every decision looks obvious in hindsight. This one isn't that. It's the actual sequence: what I got right the first time, what I got wrong and had to redo, and the moments where I changed my mind about how the whole thing should work — including one where I replaced a decision I'd made six hours earlier.

## The shape of it

AI Creator Digest is a pipeline before it's a website. A Make.com scenario watches YouTube playlists, pulls the transcript when a new video shows up, and hands it to a Netlify function. That function sends the transcript to xAI's Grok, gets back a structured digest, and commits the result as a markdown file to a public GitHub repo. The site itself is vanilla HTML, CSS, and JavaScript reading those markdown files directly, no framework, no build step. Every digest, every consensus guide, every creator profile: a file in git, not a row in a database.

That part of the design didn't change. What changed was almost everything downstream of it.

## The redesign nobody planned for

The first version worked. Then a full visual design handoff came in mid-build, a genuinely different aesthetic: minimalist, warm, hairline dividers instead of cards, a rust accent instead of purple. Taking it seriously meant more than swapping a stylesheet. The new design's centerpiece was a consensus guide built around "where creators agree" and "where they genuinely disagree," which meant the underlying content model had to change too, not just the CSS. Key points went from flat bullet lists to structured title-and-body pairs. Tactics got a category label. The whole markdown schema got rebuilt so the frontmatter carried the real structured data and the body became a plain-language doc for anyone reading the file straight on GitHub. It was a full afternoon of work that looked, from the outside, like "changing the colors."

## Finding out the free way doesn't always work

Every transcript needs to come from somewhere. Paid APIs exist for this, but there's also a free path: the same public caption endpoint YouTube's own player calls, wrapped in a small open-source library. Free is appealing, so I built it first and tested it, not just in theory but against the actual live production function once it was deployed.

It worked on the first video. It got blocked on the second. It worked on the third. Three real attempts, two different outcomes, right there in the logs. That's not a hypothetical risk in a README, that's a measured fact about how Netlify's shared IP ranges look to YouTube's bot detection. I wrote it up exactly that plainly instead of either overselling "it's free!" or underselling "it's unreliable, don't bother."

**Update, same night.** One in three became three in three, then six in six. I ran it again properly: six attempts from the live function, every one blocked. Then I tried routing the fetch through Make instead, on the theory their IPs might be clean — I got a real page back, and it had YouTube's "sign in to confirm you're not a bot" notice sitting in it with the caption tracks stripped out. Same request from my own laptop, on a home connection: worked instantly, every time.

So it isn't flaky. It's finished, for anything running in a data center. The free path is now the local-development convenience and nothing more, and the pipeline reaches for a paid transcript vendor first. That's the thing I'd been calling a documented tradeoff, arriving as a bill.

There was a version of this where I got clever — spoof a mobile client, slip past the check, keep it free. I didn't. It's a control YouTube put there deliberately, it breaks the week they change it, and I'd rather pay a few dollars a month than build my publication on top of a workaround I'd have to keep re-earning.

## The wrong YouTube account

Before any of the playlist automation could go live, I needed to know which actual playlists were feeding the system. The first account I checked had two empty default playlists and nothing else, a channel from a completely different project. The real curated playlists, twenty-two of them, spanning AI tooling, sales prospecting, web design, and a half-dozen other categories, were sitting in a different Google account entirely. Small thing, but it's the kind of detail that would have quietly broken the whole pipeline if I'd assumed instead of checking.

## The pivot that mattered most

The original plan had no human review step. Analyze, publish, done. That changed when the idea of Telegram approval came up: a message with the digest's takeaway and an Approve or Reject button before anything goes live.

The first design for that had the review content living inside Telegram itself, cramped into a 4096-character message. Better, but still limited. Then came the real question: "once it is edited and published, the published version on git isn't synced to the google doc right?" That single question forced a clean answer, no, it's a one-time pull, and it exposed that a Google Doc as the actual editable surface, not just a read-only preview, was the better design. Then came the pivot that actually reshaped the architecture: "I may want to edit the AI analysis." Not just add a comment next to it. Rewrite it.

That meant the AI's output couldn't be the final word. It had to become a draft, held in storage, reconstructable from whatever a human left in the doc, with edits winning outright over the original wherever they existed. The pipeline got split into two phases, analyze and publish, so a video could sit in review for as long as it needed to before anything touched the live site.

## What shipped that afternoon

A shared library holds the analysis and publishing logic. One function analyzes a transcript and stores the draft. A second builds the Google Doc content and sends the Telegram card. A third reads back whatever's in the doc at approval time, a plain-text template with clearly marked sections, parses it, and republishes only what's there: an emptied section means "leave this out," not "fall back to the AI version." A fourth handles rejection cleanly, nothing ever gets committed if a draft doesn't get approved.

That was the design. Hold onto it, because it didn't survive the evening.

Along the way I found and fixed a couple of real bugs myself: a markdown renderer that would swallow a literal number if it happened to sit next to a code span, reintroduced once by copy-paste after I'd already fixed it the first time, and an error classifier for the transcript fetcher that was checking for the wrong exact wording until a live test against a real deleted video caught it.

## Six things that said they worked and didn't

Then I actually wired up the automation, and the design stopped being a diagram.

Building the two Make scenarios produced six separate failures that all had the same shape: something reported success while doing something other than what I'd asked. An HTTP module failed validation on seven parameters that the platform's own field listing doesn't show you unless you ask for hidden fields. A discovery run completed cleanly and found nothing, because the data store returns its fields nested one level deeper than I'd assumed, so every YouTube call had been going out with an empty playlist ID and failing quietly. The next run created eighty-six candidate records with every field blank, for a nearly identical reason on the write side. A document-creation step failed on a folder ID of "root," which isn't a real thing in Google's API even though the validator only shrugged at it.

None of those announced themselves. The pattern I came out with: when I don't know the exact shape of something, call it with a throwaway test and print what comes back. That was consistently faster than reading the docs, and the docs were wrong-by-omission often enough that trusting them was the slower path.

## The second gate I didn't know I needed

The review step protected what goes out. Nothing protected what goes in.

Twenty-two playlists produce a lot of candidate videos, and every one I analyze costs money whether I end up publishing it or not. So there's now a gate before the gate: new videos show up in Telegram as a card, and I pick. Process, Skip, or Discard.

Three buttons instead of two, because Skip and Discard are genuinely different intentions. Skip is a three-day snooze, it comes back. Discard is permanent, it never shows up again. A single button pretending to be both would have quietly turned "not right now" into "never," and I'd never have noticed which videos I'd lost.

There's also a hard cap: one discovery run a day, and it stops adding candidates once ten are already waiting. A queue I can't get through isn't a queue, it's a guilt pile.

## Links I'm not allowed to guess

I wanted the digests to connect people, not just summarize them. If a video has a guest, I want their profile linked.

The obvious way to do that is to ask the model. The model knows who a lot of these people are. It would have answered instantly and confidently, and some percentage of the time it would have been wrong, and a wrong social handle isn't a typo. It's a link, under a real person's name, pointing at a stranger, published.

So the rule is split: the AI is allowed to tell me *who* appeared in a video and what their role was. It is not allowed to tell me *how to find them*. Every link comes from pattern-matching the creator's own description text, and the links get re-derived from that source at the moment of publishing, not stored and carried along. If I rename someone, they get their real link or no link. There's no path where a handle appears that the creator didn't write down themselves.

The cost is coverage. A well-known guest who isn't linked in the description gets no link, even when a model would probably have gotten it right. That's the feature working, not failing.

## The Doc could show me my words. It couldn't show me my page.

Here's the turning point the Google Doc was setting up.

I was thinking out loud about something else entirely and asked: what if we built the editor into the site itself, something that could preview in HTML? And then the question that actually mattered: could it add a preview step after edit and before approve?

That's when the Doc's real limit landed. It could show me the text of a digest. It could never show me the digest. And I'm not publishing text, I'm publishing a page — with a layout, a credit block, a Connect card, quotes pulled out. Approving a plain-text template meant simulating the renderer in my head and hoping. I'd been doing that all afternoon without noticing it was a compromise.

The Doc wasn't wrong. It was the fastest possible way to get a real editorial gate in front of real output, it cost nothing to build, and I already knew how to type in it. It just had an expiry date, and the expiry hit the moment I wanted to see the thing instead of read about it.

## What replaced it

A small app that opens inside Telegram. Tap Review on a card and it slides up over the chat: every section as a real field, edit what you want, then Preview.

The preview is the part I'd defend hardest. It isn't a mockup of my page, and it isn't a preview renderer someone wrote to look like my page. It is my page — the same template, the same stylesheet, the same rendering code that serves every published digest — pointed at the unpublished draft instead of a committed file. The only things that change are where the data comes from and a flag telling search engines to stay away.

That distinction is the whole point. A preview built from separate code drifts. Not loudly, either: it keeps looking right while quietly disagreeing with production, which is worse than not having one. So the check is mechanical rather than a promise: `npm test` publishes a draft, renders the preview, and fails if the two aren't byte-for-byte identical. Not "close." Identical. It's in the repo, it runs in CI-shaped form, and I broke it on purpose once to confirm it actually goes red — a guard nobody has watched fail is just a comment.

Publish from inside the app and the card in Telegram deletes itself, leaving a one-line record behind. The queue stays a queue; decided things become history.

Then I deleted the Google Doc path entirely — the doc creation, the template, the parser, all of it. Keeping it "just in case" would have left two ways to publish that could disagree about what the draft said, and one of them would have silently won.

## What I'd tell someone building something similar

Test the risky assumption for real before you build around it. "Free" and "reliable" are different claims, and the only way to know which one you're actually getting is to hit production with it. Ask where the data really lives before automating around it. And when someone tells you they want to edit the AI's output, believe them literally, don't build a system that only lets them comment on the margins.

Two more from this round. When a tool tells you it did something, check through a different door — most of my lost time this build was spent trusting a success message. And pick the borrowed tool on purpose, knowing when you'll outgrow it. Google Docs was the right call for exactly as long as I was reviewing words, and the wrong one the second I needed to review a page. That's not a mistake, that's a stage. The mistake would have been not noticing it had ended.

One more, learned the expensive way at the end of the night. Don't ship a change you have no way to test. I added a small nicety to the approval flow — an instant confirmation when you tap a button — and got one field's format wrong in a way nothing could catch until a real person tapped a real button. It broke every path through the flow, silently, for three hours, while everything else looked healthy. The fix was to delete it. A feature you can't verify isn't a feature yet, it's a wager.

## Where this actually stands

Honest status: nothing has been published yet. Zero digests. The whole chain — discovery, triage, transcript, analysis, edit, preview, publish — is built, tested, and deployed, and it has never once run end to end against a real video and produced a page. Every test passes; that's not the same thing as it working.

Right now it's waiting on one API key for the transcript vendor. That's the entire remaining distance between a pipeline that works in pieces and a pipeline that works.

Then: one real video, all the way through, and a live page that matches the preview exactly. Until that happens I'd rather say it's built than say it works.

This project is still growing. The consensus guides get rewritten every time a playlist gets a new video. The playlist list itself is a living registry, not a fixed set. I said last time this page would need an update before too long — it took about six hours. I'll keep writing them down.
