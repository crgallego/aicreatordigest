## The short version

A video's transcript goes to an AI model, which pulls out the structure: takeaway, key points, tactics, quotes. Then I edit that draft myself and look at the finished page before anything publishes. Nothing goes live that I haven't personally approved. When a collection has enough videos in it, I write a consensus guide showing where those creators agree and where they don't. That's the whole system.

## Step by step

**1. I watch playlists, not the whole internet.** Every video on this site comes from a playlist I've deliberately curated — AI, tech, SaaS, web design. I'm not scraping YouTube at random; if a channel is here, I put it here on purpose.

**2. I pick which videos are worth it.** Once a day, new videos from those playlists show up in a queue for me to triage: process it now, snooze it for a few days, or drop it entirely. Analyzing a video costs real money, so nothing gets processed just for being new. There's a hard cap on how many can sit waiting at once, which keeps the queue something I actually get through instead of a backlog I start ignoring.

**3. The transcript goes to an AI model, with instructions.** The pipeline uses xAI's Grok to turn a raw transcript into a structured digest: one key takeaway, the specific points the creator made, any named tactic or framework (with the real numbers attached), and the quotes worth keeping verbatim. The instructions are explicit about two things — preserve the creator's actual language instead of paraphrasing it into mush, and never fabricate a number, a timestamp, or a claim that isn't in the transcript. If the data isn't there, the digest just leaves it out instead of guessing.

**4. I edit the draft, then I look at the real page.** The AI's output is a draft, not a publication. I rewrite whatever needs rewriting — the takeaway, any key point, the whole tactics section — and I can delete anything entirely; an emptied section means "leave this out," not "fall back to what the AI said." Then I preview it, and the preview isn't a mockup: it's this site's own page template rendering the unpublished draft, so what I approve is exactly what ships. Only then does it publish.

**5. Where I add my own take, it says so.** When I have something to add that the creator didn't say, it goes in a clearly marked section under my name, visually separated from the summary. You should always be able to tell which sentences came from the video and which came from me.

**6. Every digest is a real markdown file in a public repo.** Nothing here lives in a private database. You can read the raw file on GitHub, you can see exactly what changed and when, and you can open an issue against a specific line if something's off. The same repository holds the software, which was built by Claude rather than by me. The [build story](/how-this-works) says which parts of this project are my work and which aren't.

**7. Consensus guides get rewritten as a playlist grows.** Once a few videos are in a collection, a synthesis pass draws out what they collectively agree on — and just as importantly, what they don't. I'd rather show you three creators actually disagreeing about test coverage or design-system guardrails than flatten it into fake consensus.

## About the links to people

Some digests carry a Connect section with links to the creator, and to anyone featured in the video.

Those links are never guessed. The AI is allowed to tell me *who* appeared in a video and what their role was. It is not allowed to tell me how to find them. Every link is pulled from the creator's own video description, and re-derived from that description at the moment of publishing. If a guest isn't linked in the description, they get no link here — even in cases where the model would almost certainly have gotten it right.

That costs coverage, on purpose. A wrong social handle isn't a typo. It's a link under a real person's name pointing at a stranger.

## What I won't do

- I won't publish a digest that reads like a takedown. If I cover a video, it's because there's something worth learning from it — the tone here is "here's what I got out of this," not a review score.
- I won't strip a creator's numbers or specifics down to generic advice. "Charge more" is useless. "Raised the minimum project fee from $3,000 to $12,000" is the actual content.
- I won't invent a quote, a timestamp, a subscriber count, or a runtime I don't actually have. If the transcript or the metadata doesn't give me something, the digest just doesn't show it — I'd rather have a gap than a fabrication.
- I won't let a model guess a real person's social profile. Those links come from the source or they don't appear.
- I won't publish anything I haven't read. There's no path through this system that skips me.

## On cadence

I'm not promising a digest a day. The queue gets reviewed daily; what comes out of it depends on what's genuinely worth publishing and on my having time to edit it properly. A slower feed of things I've actually read beats a fuller one I rubber-stamped.

## If something's wrong

Wrong attribution, a framing you don't like, or you'd just rather not be on here — [open an issue](https://github.com/crgallego/aicreatordigest/issues/new) and tell me what to fix. I take these seriously because the entire premise of this site depends on creators trusting it.
