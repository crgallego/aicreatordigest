---
type: "video"
title: "FORGET Loop Engineering. Agentic Engineering is about THIS"
slug: "forget-loop-engineering-agentic-engineering-is-about-this"
videoId: "VQy50fuxI34"
videoUrl: "https://www.youtube.com/watch?v=VQy50fuxI34"
creatorName: "Dan Eisler"
creatorSlug: "indydevdan"
creatorImage: "https://yt3.ggpht.com/BMf5YUX1T-_JNAeS6bDrxU1Dw1DGDI9AEUSE2IMb0v5hUD2I0k0wEedFw2hJeLsyPq2v75Q0TQ=s800-c-k-c0x00ffffff-no-rj"
embeddable: true
channelName: "IndyDevDan"
channelUrl: "https://www.youtube.com/channel/UC_x36zCEGilGpB1m-V4gmjg"
playlistName: "AI Company OS"
playlistSlug: "ai-company-os"
keyTakeaway: "Stop calling it loop engineering — the real leverage is designing AI developer workflows that combine engineers, agents, and code into software factories."
executiveSummary: "Dan Eisler (Indie Dev Dan) pushes back on the rising phrase “loop engineering,” which he treats as a hype-filled rebrand of the software development life cycle pushed in circles around figures like Boris Cherny and Peter Steinberger. Drawing on 15+ years as an engineer and years of weekly agentic-engineering content, he reframes the problem as building AI developer workflows inside a software factory: props in, a workflow of code plus agents runs, results out. The video walks from a simple engineer–LLM–review loop up through linters, tests, work trees, sandboxes, kanban intake, specialized hotfix pipelines, and full multi-workflow software factories. His core claim is that value comes from placing three actors — engineers, agents, and code — in the right spots, with engineers mostly at planning and review while the agentic layer compounds the rest."
description: "Dan Eisler on why loop engineering misses the point—and how AI developer workflows and software factories actually scale agents."
categories: ["Agentic Engineering","AI Developer Workflows","Software Factory","Multi-Agent Systems","AI Tooling"]
keyPoints: [{"title":"Loop engineering is a bad rebrand","body":"Dan calls loop engineering a terrible rebrand of the software development life cycle — unclear and hype-filled. Conditions and routing that send failed lint/test results back to a build agent do create loops, but that is only one control-flow piece of a larger developer workflow, not a useful name for the whole discipline.","anchor":"Loop engineering is a terrible rebrand of the software development life cycle","thought":"You know, when I first saw the term “loop engineering“ popping up it made me wonder why all of a sudden everyone was talking about it. I think when something starts to trend, people are actually a little bit more wary or cautious these days. Every time something gets rebranded with a new nickname it creates this panic or FOMO on something. This explanation and breakdown brings so much clarity. I am really thankful I came across this guy‘s content.","atSeconds":20,"at":"0:20","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=20s"},{"title":"Three actors of value creation","body":"Engineering work now has three actors: engineers, agents, and code. Knowing when and where to place each is the name of the game of agentic engineering. Consistent value creation depends on using all three, not agents alone.","anchor":"three actors of value creation for engineering work","thought":"This is really making sense and adding levity to understanding how this stuff is really meant to work. AI is an unlock but pairing it with engineer level systems thinking and a skill base of coding knowledge really brings a complete picture of just how powerful this can be.","atSeconds":219,"at":"3:39","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=219s"},{"title":"Code is the unsung hero","body":"Code is fast, runs the same way every time, and has no token cost. Of the three actors, code is the most reliable by miles, followed by engineers, then agents. Over-leveraging agents while forgetting deterministic code is what he calls AI psychosis.","anchor":"code is the unsung hero of all of this","thought":"AI psychosis is another phrase I’m starting to see used more often. For non-technical idea guys like myself, code is definitely where the skill gap exists.","atSeconds":269,"at":"4:29","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=269s"},{"title":"Think software factory workflows","body":"It is more useful to treat agent work as developer workflows inside a software factory: props go in, a specific workflow of code plus agents runs, results come out. Focus engineering time and tokens on building those AI developer workflows, not on the loop metaphor.","anchor":"building developer workflows inside your software factory","thought":"This is a note to myself to start trying to understand exactly what this means and how to unpack it.","atSeconds":55,"at":"0:55","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=55s"},{"title":"Engineers at start and end","body":"The two constraints of agentic engineering are prompting (planning) and reviewing (validation). Done at scale properly, you show up at the beginning and the end, with few exceptions — the system does the middle.","anchor":"Prompting, also known as planning, and reviewing, also known as validation","thought":"I’m starting to see the big picture here.","atSeconds":433,"at":"7:13","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=433s"},{"title":"Scale compute, not engineer effort","body":"As workflows grow you add agents and code — linters, formatters, type checks, tests, then bundled test agents, work trees, and full sandboxes — to scale compute and confidence. What you do not add is more engineering effort outside building the system that builds the system.","anchor":"We're adding compute to add confidence","thought":"Meta.","atSeconds":470,"at":"7:50","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=470s"},{"title":"Work trees then full sandboxes","body":"A popular pattern is one agent per work tree for isolation and parallelism so agents do not trip over each other. Better still is giving each agent its own sandbox computer so you can jump in, review the app/tests, then merge and ship.","anchor":"push each one of your agents into their own work tree","thought":"I’m starting to see things so differently now.","atSeconds":550,"at":"9:10","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=550s"},{"title":"Agentic layer over app layer","body":"Inside tactical agentic coding he separates the agentic layer — agents, prompts, skills, system prompts wrapping the application — from the app layer. Best teams do meta work on that agentic layer so the factory operates the product, ideally better than the team alone.","anchor":"The app layer is for your agents","thought":"I need some time to wrap my head around this, but this is all very enlightening.","atSeconds":1317,"at":"21:57","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1317s"},{"title":"Specialized factory workflows","body":"A mature setup routes tickets (chore, bug, feature, hotfix) into specialized sandbox workflows via a factory router. Heavy SOTA planner/scout stacks are not used for chores; hotfixes get surgical agents and parallel racing sandboxes with human approval in the loop.","anchor":"many different types of specialized agent sandbox workflows","thought":"I have no problem admitting when I’m in over my head.","atSeconds":1082,"at":"18:02","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1082s"},{"title":"Not vibe coding — meta-engineering","body":"Vibe coding is not knowing how the system works. Agentic engineering is knowing the system so well you do not have to look, because you templated expertise into repeatable ADWs with the right performance, price, and speed.","anchor":"agentic engineering is knowing your system works so well you don't have to look","thought":"Amazing.","atSeconds":1556,"at":"25:56","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1556s"}]
tactics: [{"kind":"workflow","title":"AI developer workflows (ADWs)","body":"Build end-to-end workflows that combine engineers, agents, and code — plan, build, test, review, merge, ship — with clear separation so context moves between nodes. Start simple (build agent then external linter looping on the same session ID), then specialize agents and add deterministic code as you productionize.","anchor":"Focus your valuable engineering time and tokens on building AI developer workflows","atSeconds":73,"at":"1:13","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=73s"},{"kind":"framework","title":"Design ADWs by doing the work first","body":"Before automating, run the target workflow end to end yourself (agents in the terminal are fine): step through each node, pass/fail conditions, review, and ship. Map it in Mermaid or on paper, then encode it as agents + engineers + code.","anchor":"design your ADWs by doing the work yourself first","atSeconds":1744,"at":"29:04","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1744s"},{"kind":"guardrail","title":"Separate code from agent skills","body":"Do not bury lint/test/CI inside one giant skill. Use an agent SDK, run a build agent, then run linters/typecheckers/tests as code that feeds failures back. Separation of concerns enables guardrails, isolatable tests, and reliable information flow at scale.","anchor":"You have to separate your code and your agents","atSeconds":1650,"at":"27:30","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1650s"},{"kind":"workflow","title":"Production-crash hotfix ADW","body":"Pre-build a crisis path: support ticket hits Slack/Teams, engineer prompts a scout into a surgical hotfix agent optimized only for ASAP fix, human approves/rejects, then multiple sandboxes race solutions in parallel and loop until pass, engineer validates, ship. Ask whether your org actually has this workflow.","anchor":"Do you have an agentic workflow for production crashes?","atSeconds":1048,"at":"17:28","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1048s"},{"kind":"framework","title":"KISS then agents-plus-code","body":"Start with the simplest babysit-the-agent loop, optionally pure skills. As soon as you get serious, move skill work into code for performance, reliability, and zero-token speed. Agents plus code beats either alone; keep classic patterns — isolatable, decoupled, single interface — because the workflow multiplies hundreds or thousands of times.","anchor":"agents plus code beats either alone","atSeconds":1872,"at":"31:12","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1872s"}]
quotes: [{"text":"Forget about loop engineering. Focus your valuable engineering time and tokens on building AI developer workflows.","anchor":"","atSeconds":70,"at":"1:10","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=70s"},{"text":"You want to be building the system that builds the system.","anchor":"","atSeconds":689,"at":"11:29","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=689s"},{"text":"Code is the unsung hero of all of this. Consistent value creation creates consistent business value.","anchor":"","atSeconds":269,"at":"4:29","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=269s"},{"text":"Vibe coding is not knowing how the system works and it's not looking at how the system works. Agentic engineering is knowing your system works so well you don't have to look.","anchor":"","atSeconds":1551,"at":"25:51","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=1551s"},{"text":"If we have loop engineering, we need to have condition engineering and then we need to have function engineering.","anchor":"","atSeconds":534,"at":"8:54","atUrl":"https://www.youtube.com/watch?v=VQy50fuxI34&t=534s"}]
editorNote: "The domain expertise level here is off the charts. I look forward to learning more from this guy’s content."
run: {"model":"grok-4.5","seconds":41.5,"promptTokens":8978,"completionTokens":2121,"totalTokens":11585,"costUsd":null,"ranAt":"2026-07-29T19:46:59.963Z"}
readTimeMinutes: 6
addedAt: "2026-07-29T20:12:14.992Z"
updatedAt: "2026-07-29T20:12:14.992Z"
---

# FORGET Loop Engineering. Agentic Engineering is about THIS

## Featuring Dan Eisler

**Creator:** Dan Eisler  
**Channel:** [IndyDevDan](https://www.youtube.com/channel/UC_x36zCEGilGpB1m-V4gmjg)  
**Subscribe:** https://www.youtube.com/channel/UC_x36zCEGilGpB1m-V4gmjg  
**Original video:** [FORGET Loop Engineering. Agentic Engineering is about THIS](https://www.youtube.com/watch?v=VQy50fuxI34)

---

## Key Takeaway

> Stop calling it loop engineering — the real leverage is designing AI developer workflows that combine engineers, agents, and code into software factories.

## In Context

Dan Eisler (Indie Dev Dan) pushes back on the rising phrase “loop engineering,” which he treats as a hype-filled rebrand of the software development life cycle pushed in circles around figures like Boris Cherny and Peter Steinberger. Drawing on 15+ years as an engineer and years of weekly agentic-engineering content, he reframes the problem as building AI developer workflows inside a software factory: props in, a workflow of code plus agents runs, results out. The video walks from a simple engineer–LLM–review loop up through linters, tests, work trees, sandboxes, kanban intake, specialized hotfix pipelines, and full multi-workflow software factories. His core claim is that value comes from placing three actors — engineers, agents, and code — in the right spots, with engineers mostly at planning and review while the agentic layer compounds the rest.

## Key Points

1. **Loop engineering is a bad rebrand** — Dan calls loop engineering a terrible rebrand of the software development life cycle — unclear and hype-filled. Conditions and routing that send failed lint/test results back to a build agent do create loops, but that is only one control-flow piece of a larger developer workflow, not a useful name for the whole discipline.

   _My thought: You know, when I first saw the term “loop engineering“ popping up it made me wonder why all of a sudden everyone was talking about it. I think when something starts to trend, people are actually a little bit more wary or cautious these days. Every time something gets rebranded with a new nickname it creates this panic or FOMO on something. This explanation and breakdown brings so much clarity. I am really thankful I came across this guy‘s content._

2. **Three actors of value creation** — Engineering work now has three actors: engineers, agents, and code. Knowing when and where to place each is the name of the game of agentic engineering. Consistent value creation depends on using all three, not agents alone.

   _My thought: This is really making sense and adding levity to understanding how this stuff is really meant to work. AI is an unlock but pairing it with engineer level systems thinking and a skill base of coding knowledge really brings a complete picture of just how powerful this can be._

3. **Code is the unsung hero** — Code is fast, runs the same way every time, and has no token cost. Of the three actors, code is the most reliable by miles, followed by engineers, then agents. Over-leveraging agents while forgetting deterministic code is what he calls AI psychosis.

   _My thought: AI psychosis is another phrase I’m starting to see used more often. For non-technical idea guys like myself, code is definitely where the skill gap exists._

4. **Think software factory workflows** — It is more useful to treat agent work as developer workflows inside a software factory: props go in, a specific workflow of code plus agents runs, results come out. Focus engineering time and tokens on building those AI developer workflows, not on the loop metaphor.

   _My thought: This is a note to myself to start trying to understand exactly what this means and how to unpack it._

5. **Engineers at start and end** — The two constraints of agentic engineering are prompting (planning) and reviewing (validation). Done at scale properly, you show up at the beginning and the end, with few exceptions — the system does the middle.

   _My thought: I’m starting to see the big picture here._

6. **Scale compute, not engineer effort** — As workflows grow you add agents and code — linters, formatters, type checks, tests, then bundled test agents, work trees, and full sandboxes — to scale compute and confidence. What you do not add is more engineering effort outside building the system that builds the system.

   _My thought: Meta._

7. **Work trees then full sandboxes** — A popular pattern is one agent per work tree for isolation and parallelism so agents do not trip over each other. Better still is giving each agent its own sandbox computer so you can jump in, review the app/tests, then merge and ship.

   _My thought: I’m starting to see things so differently now._

8. **Agentic layer over app layer** — Inside tactical agentic coding he separates the agentic layer — agents, prompts, skills, system prompts wrapping the application — from the app layer. Best teams do meta work on that agentic layer so the factory operates the product, ideally better than the team alone.

   _My thought: I need some time to wrap my head around this, but this is all very enlightening._

9. **Specialized factory workflows** — A mature setup routes tickets (chore, bug, feature, hotfix) into specialized sandbox workflows via a factory router. Heavy SOTA planner/scout stacks are not used for chores; hotfixes get surgical agents and parallel racing sandboxes with human approval in the loop.

   _My thought: I have no problem admitting when I’m in over my head._

10. **Not vibe coding — meta-engineering** — Vibe coding is not knowing how the system works. Agentic engineering is knowing the system so well you do not have to look, because you templated expertise into repeatable ADWs with the right performance, price, and speed.

   _My thought: Amazing._


## Tactics

### AI developer workflows (ADWs) _(workflow)_

Build end-to-end workflows that combine engineers, agents, and code — plan, build, test, review, merge, ship — with clear separation so context moves between nodes. Start simple (build agent then external linter looping on the same session ID), then specialize agents and add deterministic code as you productionize.

### Design ADWs by doing the work first _(framework)_

Before automating, run the target workflow end to end yourself (agents in the terminal are fine): step through each node, pass/fail conditions, review, and ship. Map it in Mermaid or on paper, then encode it as agents + engineers + code.

### Separate code from agent skills _(guardrail)_

Do not bury lint/test/CI inside one giant skill. Use an agent SDK, run a build agent, then run linters/typecheckers/tests as code that feeds failures back. Separation of concerns enables guardrails, isolatable tests, and reliable information flow at scale.

### Production-crash hotfix ADW _(workflow)_

Pre-build a crisis path: support ticket hits Slack/Teams, engineer prompts a scout into a surgical hotfix agent optimized only for ASAP fix, human approves/rejects, then multiple sandboxes race solutions in parallel and loop until pass, engineer validates, ship. Ask whether your org actually has this workflow.

### KISS then agents-plus-code _(framework)_

Start with the simplest babysit-the-agent loop, optionally pure skills. As soon as you get serious, move skill work into code for performance, reliability, and zero-token speed. Agents plus code beats either alone; keep classic patterns — isolatable, decoupled, single interface — because the workflow multiplies hundreds or thousands of times.

## Quotes

> "Forget about loop engineering. Focus your valuable engineering time and tokens on building AI developer workflows."
>
> — Dan Eisler (1:10)

> "You want to be building the system that builds the system."
>
> — Dan Eisler (11:29)

> "Code is the unsung hero of all of this. Consistent value creation creates consistent business value."
>
> — Dan Eisler (4:29)

> "Vibe coding is not knowing how the system works and it's not looking at how the system works. Agentic engineering is knowing your system works so well you don't have to look."
>
> — Dan Eisler (25:51)

> "If we have loop engineering, we need to have condition engineering and then we need to have function engineering."
>
> — Dan Eisler (8:54)

## My Thoughts

_Chris Gallego's own take — not AI-generated._

The domain expertise level here is off the charts. I look forward to learning more from this guy’s content.

---

All credit to Dan Eisler. Watch the full video and subscribe to IndyDevDan — that's where the real work lives.

**▶ [FORGET Loop Engineering. Agentic Engineering is about THIS](https://www.youtube.com/watch?v=VQy50fuxI34)**

**Channel: [IndyDevDan](https://www.youtube.com/channel/UC_x36zCEGilGpB1m-V4gmjg)**
