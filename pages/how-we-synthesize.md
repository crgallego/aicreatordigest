## The short version

I watch the video (or, more precisely, I read its transcript), I ask an AI model to pull out the structure — takeaway, key points, tactics, quotes — and I publish it as a page that credits the creator at the top and links back to their video and channel. When a collection has enough videos in it, I write a consensus guide showing where those creators agree and where they don't. That's the whole system.

## Step by step

**1. I watch playlists, not the whole internet.** Every video on this site comes from a playlist I've deliberately curated — AI, tech, SaaS, web design. I'm not scraping YouTube at random; if a channel is here, I put it here on purpose.

**2. The transcript goes to an AI model, with instructions.** I use xAI's Grok to turn a raw transcript into a structured digest: one key takeaway, the specific points the creator made, any named tactic or framework (with the real numbers attached), and the quotes worth keeping verbatim. The instructions are explicit about two things — preserve the creator's actual language instead of paraphrasing it into mush, and never fabricate a number, a timestamp, or a claim that isn't in the transcript. If the data isn't there, the digest just leaves it out instead of guessing.

**3. Every digest is a real markdown file in a public repo.** Nothing here lives in a private database. You can read the raw file on GitHub, you can see exactly what changed and when, and you can open an issue against a specific line if something's off.

**4. Consensus guides get rewritten as a playlist grows.** Once a few videos are in a collection, I synthesize what they collectively agree on — and just as importantly, what they don't. I'd rather show you three creators actually disagreeing about test coverage or design-system guardrails than flatten it into fake consensus.

**5. Publishing is daily.** New digests go up as videos get processed — I'm not batching this into a weekly newsletter format, at least not yet.

## What I won't do

- I won't publish a digest that reads like a takedown. If I cover a video, it's because there's something worth learning from it — the tone here is "here's what I got out of this," not a review score.
- I won't strip a creator's numbers or specifics down to generic advice. "Charge more" is useless. "Raised the minimum project fee from $3,000 to $12,000" is the actual content.
- I won't invent a quote, a timestamp, a subscriber count, or a runtime I don't actually have. If the transcript or the metadata doesn't give me something, the digest just doesn't show it — I'd rather have a gap than a fabrication.

## If something's wrong

Wrong attribution, a framing you don't like, or you'd just rather not be on here — [open an issue](https://github.com/crgallego/aicreatordigest/issues/new) and tell me what to fix. I take these seriously because the entire premise of this site depends on creators trusting it.
