## Why this exists

I don't have time to watch all of this.

That's the whole motivation, and I'd rather state it plainly than dress it up into a mission. There is a lot of genuinely useful material in these videos, more of it every week than anyone can sit through, and watching forty minutes to get to the six that matter is not something I can do at the rate it arrives. I still wanted to learn from it.

So this is what I came up with. A workaround, at first. Something that reads them for me and hands back the part worth having, with me still on the hook for every one that goes out.

It turned into more than that. It's where I publish now, and where I put my own thinking next to what the creators said, and where the technical side of making it work gets written down instead of disappearing into a chat window.

Everything below is that last part: how it got built, including where it went wrong.

## Who did what

Before anything else, because the earlier version of this page got it wrong.

I did not write this software. I described what I wanted, argued about it, changed my mind, said no to things, and made the final call on everything that shipped. The code, the debugging, and most of the discoveries below came from Claude, working in Claude Code. That includes the parts of this story that sound clever. It also includes some of the parts that sound like disasters, which I'm leaving in for the same reason.

The split, roughly:

**Mine.** The idea. The twenty-two curated playlists. The editorial rules, including the ones that cost coverage. Every "no" in the story below. The decision to pay rather than work around a block. The demand for a human review gate, and later the demand to be able to rewrite the AI's output rather than comment on it. The call that a preview had to show the page, not the text. Which model, how often, what the queue is allowed to do. The commentary on every published digest, which is mine and is marked as mine.

**Claude's.** All of the code. The failure analysis. Finding the causes of six separate outages, most of which looked like something else. The tests, including the ones that caught its own bugs before they shipped. The Make scenarios. This page's prose, written from the actual session and then checked by me.

If you want to verify that split rather than take my word for it, the repository is public and the commits carry a co-author trailer.

An earlier version of this page said "I built it first and tested it" and "I found and fixed a couple of real bugs myself." That was inaccurate. This is the correction.

## The shape of it

AI Creator Digest is a pipeline before it's a website. A Make.com scenario watches YouTube playlists, and when a new video shows up it goes into a queue for me to triage. Approve one and a Netlify function fetches the transcript, sends it to xAI's Grok, gets back a structured digest, and holds it as a draft. I edit and approve it from an app inside Telegram. Only then does it become a markdown file committed to a public GitHub repo. The site itself is vanilla HTML, CSS, and JavaScript reading those files directly: no framework, no build step. Every digest, every consensus guide, every creator profile is a file in git, not a row in a database.

That part of the design didn't change. Almost everything downstream of it did.

## Finding out the free way doesn't work

Every transcript has to come from somewhere. Paid APIs exist. There's also a free path: the same public caption endpoint YouTube's own player uses, wrapped in a small open-source library.

Free is appealing, so that got built first, and tested against the live deployed function rather than in theory. It worked on the first video, got blocked on the second, worked on the third. One in three, measured, written down honestly instead of being oversold as "it's free" or dismissed as "unreliable."

Then it got measured again properly, and one in three had become six in six. Every attempt from the live function, blocked. Routing the request through Make instead, on the theory that their addresses might be clean, returned a real page with YouTube's "sign in to confirm you're not a bot" notice sitting in it and the captions stripped out. The same request from my laptop on a home connection worked instantly, every time.

So it isn't flaky. It's finished, for anything running in a data center.

There was a version of this where we got clever: spoof a mobile client, slip past the check, keep it free. That one's mine, and the answer was no. It's a control YouTube put there on purpose, it breaks the week they change it, and I'd rather pay a few dollars a month than build a publication on a workaround I have to keep re-earning. The free path is now a local development convenience and nothing else.

## The wrong YouTube account

Before any of the playlist automation could go live, we needed to know which playlists were actually feeding it. The first account checked had two empty default playlists and nothing else, a channel from a completely different project. The real curated ones, twenty-two of them across AI tooling, sales, web design and a half-dozen other categories, were in a different Google account entirely.

Small thing. It's also the kind of assumption that would have quietly broken everything downstream, and it was caught by checking rather than assuming.

## The pivot that mattered most

The original plan had no human review step. Analyze, publish, done.

I killed that. What replaced it was a Telegram message with the digest's takeaway and an Approve or Reject button. Better. Still not right, because the review content was crammed into a 4096-character message.

The thing that actually reshaped the architecture was me saying I might want to edit the AI's analysis. Not annotate it. Rewrite it.

That has consequences that go well past a text box. It means the model's output can't be the final word: it has to become a draft, held in storage, with human edits winning outright wherever they exist, and an emptied section meaning "leave this out" rather than "fall back to what the AI said." The pipeline got split into two phases, analyze and publish, so a video can sit in review as long as it needs to before anything touches the live site.

## The second gate I didn't know I needed

The review step protects what goes out. Nothing protected what goes in.

Twenty-two playlists produce a lot of candidates, and every one analyzed costs money whether it publishes or not. So there's a gate before the gate: new videos arrive as a card, and I choose. Process, Skip, or Discard.

Three buttons instead of two, because Skip and Discard are different intentions. Skip is a three-day snooze and it comes back. Discard is permanent. One button pretending to be both would have quietly turned "not right now" into "never," and I'd never have known which videos I'd lost.

There's also a hard cap: one discovery run a day, and it stops adding once ten are waiting. A queue I can't get through isn't a queue, it's a guilt pile.

## Links I'm not allowed to guess

I wanted digests to connect people, not just summarize them. If a video has a guest, link them.

The obvious way is to ask the model, which knows who a lot of these people are. It would answer instantly and confidently, and some percentage of the time it would be wrong. A wrong social handle isn't a typo. It's a link under a real person's name pointing at a stranger, published.

So the rule splits: the AI can tell me *who* appeared and what their role was. It cannot tell me *how to find them*. Every link is pattern-matched from the creator's own description text and re-derived from that source at publish time rather than stored and carried along.

The cost is coverage. A well-known guest who isn't linked in the description gets no link, even where the model would probably have been right. That's the rule working, not failing.

## The Doc could show me my words. It couldn't show me my page.

For a while the editable surface was a Google Doc. It was the fastest way to get a real editorial gate in front of real output, it cost nothing, and I already knew how to type in it.

Then I asked whether we could add an HTML preview step after editing and before approving, and the Doc's limit landed. It could show me the text of a digest. It could never show me the digest. I'm not publishing text. I'm publishing a page, with a layout, a credit block, a Connect card, quotes pulled out. Approving a plain-text template meant simulating the renderer in my head and hoping.

The Doc wasn't wrong. It had an expiry date, and the expiry hit the moment I wanted to see the thing instead of read about it.

## What replaced it

A small app that opens inside Telegram. Tap Review on a card and it slides up over the chat: every section as a real field, edit what you want, then Preview.

The preview is the part worth defending. It isn't a mockup of the page and it isn't a preview renderer written to look like the page. It is the page: same template, same stylesheet, same rendering code that serves every published digest, pointed at the unpublished draft instead of a committed file. The only differences are where the data comes from and a flag telling search engines to stay away.

That distinction is the whole point, because a preview built from separate code drifts, and it drifts quietly. It keeps looking right while disagreeing with production, which is worse than not having one. So the check is mechanical rather than a promise: the test suite publishes a draft, renders the preview, and fails if the two aren't byte-for-byte identical. Not close. Identical. Claude broke it on purpose once to confirm it actually goes red, which I'd argue is the only reason to believe any guard.

Then the Google Doc path was deleted entirely. Keeping it "just in case" would have left two ways to publish that could disagree about what the draft said, and one of them would have silently won.

## The night everything looked fine

This is the part I'd want someone else to read.

A small nicety got added to the approval flow: an instant confirmation when you tap a button. Ten seconds of anyone's day. It was wired first in the sequence, so the acknowledgement would beat the wait.

One field's format was wrong. A confirmation wired wrong in the first position doesn't just fail to confirm. It stops everything behind it.

Every path. Every tap. For three hours. And the whole time it looked healthy: tests green, work apparently proceeding, status reports accurate about whatever they were about and silent about the fact that nothing had worked since 02:20. All I could see was a spinner. I said it plainly at the time: loading, then nothing.

It wasn't found by reading code. It was found by subtracting two timestamps. Last time the system worked: 23:47. Time the confirmation was added: 02:20. That's the whole investigation, and it took three hours to think of.

The confirmation couldn't be tested, either. Genuinely, not lazily. The thing it needs only exists for a few seconds after a live human taps a live button, and you can't fake that. So the only way to find out was to ship it and wait for me to walk into it.

It was deleted rather than fixed. You can't repair what you can't verify.

The lesson stuck: a change you can't verify doesn't get to stand where its failure stops other work. Not because it will fail, but because when it does you won't know, and the least important thing in the system will have quietly taken the whole system with it.

## Three failures that reported success

Later, a harder version of the same idea showed up three times in one day.

**A vault that wasn't locked.** Every function touching stored data started reporting that its storage environment had never been configured. It had worked an hour earlier. The cause turned out to be a platform rule about which style of function receives storage credentials, decided by looking at what a file exports. Ours exported the wrong name, and had all along. The proof was elegant: leave the offending export in place but set it to nothing. The platform still refused, which meant the name was the trigger, not what sat behind it.

**A ceiling nobody mentioned.** Analysis kept dying at exactly 30000 milliseconds. A number that round is a policy, not a failure. Our plan caps synchronous functions at thirty seconds and silently ignores the larger number written in the config. Moving the work to a background function gave it fifteen minutes.

**A boolean that lied.** Every digest carries a field for whether the creator permits embedding the video. It said no. For hours. And no is a real answer, the kind a person decides.

Except she never decided it. The key used to ask her had a restriction on it, the question never got through, and the code that couldn't ask wrote down *no*, because there's nowhere on that form to write "didn't ask." It would have shipped that way indefinitely. Nothing breaks. Nobody complains. A link where a player should be doesn't look like an injury. It only surfaced because I fixed the key for unrelated reasons and a value changed that had no business changing.

That's the sharpest thing this project has taught either of us. Not that things fail. That a system with no way to say *failed* will use the word next to it, and the word next to it usually means something a person actually chose.

## The video that disappeared

I tapped Process on a video and nothing came back. Ten minutes of nothing. No card, no error.

Both sides had an alibi. The automation platform recorded the handoff as a successful operation, counted it, and moved on to steps that could only have run if the handoff hadn't blocked them. The receiving service has no record of ever getting it. Neither is lying. Neither keeps the one piece of evidence that would settle it.

Two conclusions got drawn and withdrawn along the way, which I'm keeping in because the withdrawals are the useful part. First: the logs are empty, so it never ran. The logs were just late by several minutes. Second: the logs are broken entirely. They weren't, still late. An empty page isn't a witness saying no. It's a witness who hasn't arrived.

There was also a good suspect, a deploy that went out shortly before, with motive and opportunity sitting right there in the timeline. It published ninety four seconds before the tap. Ninety four seconds is ninety four seconds, so it was cleared. An answer that fits the clock is the easiest kind of wrong.

The cause was never established, and the same request replayed successfully three times afterward. But the real problem was never the dropped request. Dropped requests are ordinary. The problem is that approving a video deletes it from the queue *immediately*, so the request in flight is the only copy of it. Losing the request doesn't delay the work. It deletes it.

## So now something watches

Once an hour, a check runs from outside the pipeline: everything that went in, did it come out. A draft exists, or a digest was published, or something went missing.

If something went missing, it rebuilds what the queue threw away from the video ID alone and runs the analysis again, once. If that fails too it tells me once, and then never mentions it again. That last part I insisted on. Something that reports good news every fifteen minutes is something I stop reading by Thursday.

It reads published state from the repository rather than from the live site, deliberately, because at the time it was built the site's own domain wasn't resolving. A monitor that shares a dependency with the thing it monitors isn't independent of it.

Six tests cover it, and one of them caught a real bug before it went out: a wrong field name that would have declared every published digest missing and started re-analysing all of them.

## Where this actually stands

The first digest is published. That happened on 29 July 2026, and until that afternoon this section said zero, across four straight rewrites of this page.

It went through the whole chain: discovery, triage, a paid transcript, analysis by Grok 4.5 in sixty eight seconds across about 12,700 tokens, my edits, my commentary on every key point, the preview, and publication as a markdown file in a public repo. Nineteen of twenty timestamps resolved against 916 caption segments and link into the video at the right second. The twentieth didn't match, so it shipped with no timestamp at all rather than a guess. The creator's avatar is her real one, pulled from her own channel. The video embeds because she allows it, which we now know because we finally managed to ask.

What's still open, honestly: the custom domain was connected the same day and hadn't finished serving when I last checked. Publishing commits to GitHub but doesn't yet trigger a deploy on its own, so there's a manual step between "published" and "readable" that shouldn't exist. The discovery scenario looks like it isn't finding anything and needs investigating.

And one more, which belongs here rather than in a footnote. During all of this, a request to check whether a credential worked was carried out by invoking the *publishing* function, and it published. A live article under a real creator's name, about nothing, six commits deep. I said what I thought. It got removed by explicit deletion commits rather than by rewriting history, so the record of the mistake stays visible, which is why you can still find it in the repo. Claude made that mistake. I'm keeping it on this page for the same reason the rest of it is here.

## What I'd tell someone building this way

Test the risky assumption for real before building around it. Free and reliable are different claims.

When someone says they want to edit the AI's output, believe them literally. Don't build a system that only lets them comment in the margins.

Don't ship what you can't verify into a position where its failure stops everything else.

When a tool says it did something, check through a different door. Most of the lost time on this build was spent trusting a success message.

And be honest about who did what. I had the idea, I set the rules, I made the calls, and I say no a lot. The engineering is Claude's, including the failures. Writing it the other way around was easier and it was also, on inspection, just false.

This page is still growing. Last time I said it would need an update before too long, and it took about six hours. This version took a day.
