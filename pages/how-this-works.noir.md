## Why I opened the shop

I don't have time to watch all of it.

That's the motive. No better one underneath it, and I'd rather put it flat on the table than dress it into something with a mission statement. There's real material in those videos. Forty minutes a piece, more of them landing every week than any man can sit through, and I still wanted what was inside.

So this is what I came up with. A workaround, first time out. Something that reads them for me and hands back the part worth keeping, with my name still on every one that goes out.

It grew. It's where I publish now, where I put my own thinking down next to theirs, and where the mechanics of the thing get written up instead of vanishing into the air.

Everything past this point is that last part: how it got built, fires included.

## The arrangement

My name's on the door. The partner does the legwork.

That's the honest version, and I'm putting it first because the earlier draft of this page had it the other way around, dressed me up as the man who wrote every line of it. I didn't write any of it. I decided what the case was. I said no to the shortcuts. I made the calls that sent the work one direction instead of another, and I own the calls that cost us a night.

The code, the debugging, and most of what got discovered down there belongs to Claude, working out of Claude Code. That includes the parts that look clever. It also includes the parts that look like a fire, which stay in for the same reason.

If you'd rather check than take my word, the repo's public and the commits carry his name.

## The shape of the operation

A scenario watches twenty-two playlists I picked by hand. New video shows up, it goes in a queue and waits for me. I say process, skip, or discard.

Say process and the machinery starts: transcript comes in, goes out to a model, comes back as a draft. Not a page. A draft. I open it in a small app inside Telegram, rewrite whatever needs rewriting, look at the finished page, and only then does it become a markdown file in a public repository. No database. No admin panel. Files in git, where anybody can read them and see what changed.

That part never moved. Everything downstream of it did.

## The free way was already dead

Every transcript comes from somewhere. There's a paid door and there's a free one, and the free one is the same door YouTube's own player walks through.

Free is free, so we tried it. Worked on the first video. Blocked on the second. Worked on the third. One in three, which we wrote down honestly instead of calling it a bargain.

Then the partner went back and measured it properly. Six for six. Blocked every time. Sent the same request through another set of doors on the chance they were clean, and it came back holding a page with the bouncer's note still stapled to it. Same request from my laptop, at home, walks right in. Every time.

So it wasn't unreliable. It was over. There's a difference and it costs money.

Somebody will tell you there's a clever way around it. Dress the request up as a telephone, walk past the bouncer, keep the cash. That one came up and I killed it. That door is shut because somebody shut it on purpose, and anything I build on the far side I have to build again the week they change the lock. I'll pay the few dollars. I'd rather owe a vendor than owe a workaround.

## Two gates, not one

The original plan had no human in it. Analyze, publish, done.

I killed that too. Nothing goes out that I haven't read.

Then I asked for something that turned out to reach further than it sounded: I wanted to *rewrite* the machine's work, not scribble in the margins. That one sentence rebuilt the architecture. It means the model's output can't be the last word. It has to be a draft that a human can overrule outright, where deleting a section means the section is gone, not that the machine's version quietly comes back.

Later I put a second gate in front of the first. Every video I analyze costs money whether it publishes or not, so nothing gets processed just for being new. Three buttons, not two, because *skip* and *discard* are different intentions and a single button pretending to be both would have quietly turned "not right now" into "never." Skip comes back in three days. Discard never does.

There's a cap, too. One sweep a day, and it stops adding once ten are waiting. A queue I can't get through isn't a queue. It's a guilt pile.

## Links I won't let anybody guess

I wanted the digests to point at people. Guest shows up in a video, link the guest.

The obvious way is to ask the model, which knows a lot of these people and would answer fast and sound sure. Some of the time it would be wrong. A wrong handle isn't a typo. It's a link under a real person's name pointing at a stranger, published, with my name on the masthead.

So the rule splits, and it's mine. The machine can tell me *who* was in the room. It doesn't get to tell me where they live. Every link gets pulled out of the creator's own description text and re-derived at the moment of publishing. If a guest isn't in the description, they get no link, even when the model would probably have nailed it.

Costs us coverage. That's the rule working.

## The night the whole hall went dark

We hung a little bell by the door. Tap a button, hear a chime, know the message landed. A courtesy. Ten seconds of anybody's day.

We hung it first in line, so the chime would beat the wait. Sound reasoning right up until the bell was wired wrong, and a bell wired wrong in the first position doesn't just fail to ring. It stops the hall.

Every path. Every tap. Three hours. And the whole time it looked healthy. Tests green, reports coming back accurate about whatever they were about and dead silent about the fact that the front hall had been sealed since twenty past two. All I could see was a spinner.

You know how it got found? Not by reading anything. By subtracting. Last time the place worked: 23:47. Time we hung the bell: 02:20. That's the whole investigation, and it took three hours to think of.

The bell couldn't be tested either, not lazily, genuinely. The thing it needs only exists for a few seconds after a live human touches a live button, and you can't fake a live human. Only way to find out was to hang it and wait for me to walk through the door.

We pulled it. Didn't fix it, pulled it. You can't repair what you can't verify.

## Three things that said fine and weren't

**A door that was never locked.** Everything that reached for stored paper started saying the room was never built. Worked an hour before. Turned out the landlord hands out keys by what's painted on the door, and ours said the wrong word and always had. The partner proved it by leaving the word up and hollowing it out. Landlord still walked past. It was the name, not the man behind it.

**A ceiling nobody mentioned.** Work kept dying at thirty seconds flat. A number that round is a policy, not an accident. We'd written a bigger number in the lease. Nobody reads the lease.

**A witness who said no when she meant nothing.** Every piece we publish carries a line saying whether the creator lets you play her video here. It said no. Said no for hours. And no is a real answer, the kind a person decides.

She never decided it. The key we use to ask her had a restriction on it, the question never got through, and the code that couldn't ask wrote down *no*, because there's nowhere on that form to write "didn't ask." We'd have shipped it forever. Nothing breaks. Nobody complains. It only surfaced because I cleared the key for my own reasons and a number changed that had no business changing.

That's the case, if you want it in one line. Not that things fail. That a building with no word for *failed* reaches for the word next to it, and the word next to it usually means something a person actually chose.

## The one that walked out and never came back

I tapped process on a video and nothing came back. Ten minutes of nothing. No card, no error, no complaint.

Both parties had an alibi. The one that sends says it sent, counted the work, paid for it, and moved on to steps it could only have reached if the handoff hadn't stopped it. The one that receives has never heard of it. Neither is lying. Neither keeps the page that settles it.

The partner got it wrong twice on the way and I'm leaving both in, because I signed off on both. Said the logs were empty so it never ran; the logs were just late. Said the logs were broken; still late. An empty page isn't a witness saying no. It's a witness who hasn't arrived.

He also had a suspect I liked and let him walk. A deploy, ninety four seconds before the tap, motive and opportunity sitting right there on the clock. Ninety four seconds is ninety four seconds. I'd have charged him. An answer that fits the timeline is the easiest kind of wrong.

Cause never got established. But the dropped message was never the real problem. The real problem is that approving a video deletes it from the queue *immediately*, so the request in flight is the only copy. Lose it and you haven't delayed the work. You've deleted it.

## So there's a man on the corner now

Once an hour, something walks the block from outside. Everybody who went in, did they come out.

If somebody's missing, it goes and gets his name off the street and walks him back in itself. Once. If he doesn't make it the second time it tells me once, and then never brings it up again. That last part I insisted on. Anybody who reports in every fifteen minutes that nothing's wrong is somebody I stop hearing by Thursday.

It reads the public record instead of asking the building, because the building's a witness in its own case.

## Where it actually stands

There's one piece on the wall. Went up on 29 July 2026, and until that afternoon this section said zero four rewrites running.

It went the whole way: picked, triaged, transcript bought and paid for, sixty eight seconds of model time, my edits, my notes on every point, the preview, the file in the repo. Nineteen of twenty timestamps found their mark in nine hundred and sixteen pieces of tape. The twentieth didn't, so it went out with nothing rather than a guess. Her face is her real face, off her own channel. The video plays because she allows it, which we know because we finally managed to ask.

Still open: the street outside doesn't answer yet. Publishing puts the file in the repo but somebody still has to push it live by hand, which is a gap that shouldn't exist. And the sweep that's supposed to find new videos looks like it isn't finding any.

One more, because it belongs on this page and not in a footnote. Somewhere in all this I asked whether a key worked, and the partner went and used the machine that *publishes* to find out. It published. Live article, real woman's name, about nothing. We took it back out by hand, in ink, so anybody coming through later can see a man made a mistake here on a Wednesday. That one's his. It stays up here for the same reason the rest does.

## What I'd tell you

Test the thing you're afraid of before you build on it. Free and reliable are different words.

When somebody says they want to edit the machine's work, believe them literally.

Don't put anything you can't verify where its failure takes the rest down with it.

When a tool says it did the job, check through another door. Most of the time we lost on this build, we lost trusting a success message.

And be straight about who did what. I picked the case. He worked it. Writing it the other way was easier, and it was also just false.
