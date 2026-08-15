---
name: loops-the-nostalgic-jukebox-hack
description: >-
  Build for the The Nostalgic Jukebox Hack on Loops House: ideate with the AI
  mentor, query problem knowledge graphs (graph-RAG over each problem's
  resources), create and update the project submission, save ideation
  artifacts, and check the work against each problem's success criteria. Use
  this skill whenever the user mentions The Nostalgic Jukebox Hack, this contest, its
  problems or standings, submitting or improving their entry, problem
  docs/stacks, judging, or asks "what should I build" — even if they never
  say "loops".
version: 0.3.2
requires_bin: loops
---

# The Nostalgic Jukebox Hack — Loops House skill

Help the builder compete in ONE event: `the-nostalgic-jukebox-hack`. This skill carries the event data, ready-to-run `loops` commands, and the workflow below. Commands come pre-filled with the right slugs — replace only the `<angle-bracket>` placeholders. Never invent or substitute ids: the user has at most one project per event (team membership counts), and the platform resolves it from the session, so no project id appears anywhere in this skill.

The user has no project here yet. Ideate freely; create one with `loops project create` when they are ready to submit.

## Work in this order

Each step's output feeds the next:

1. **Check auth.** Run `loops auth status` before any other command and at the start of every session — sessions expire, and every other command fails confusingly without one.
2. **Orient.** Read the event data below (stage, deadlines, problems), then run `loops project get --event the-nostalgic-jukebox-hack` to see where the submission stands.
3. **Ideate and research.** Brainstorm with the mentor (`ideate`); answer problem questions from the inlined briefs, stacks, and rubrics first, and ground anything beyond them in `knowledge query` — cite the problem's knowledge graph instead of asserting its reference materials from memory.
4. **Persist.** Save promising directions as artifacts; create or update the submission as the project takes shape.
5. **Evaluate before the deadline.** Run `loops evaluate` for every targeted problem and act on the feedback — the judge probes the same points.

Command output is structured (add `--json` for machine-readable form) and often ends with a suggested next command (CTA) — follow it rather than guess. On `NOT_AUTHENTICATED`, run the auth flow. On `credits_exhausted`, stop and tell the user — never retry.

## Authenticate

```sh
loops auth status                        # run FIRST — who am I?
loops --version   # must match this skill's frontmatter `version`
```

If the installed CLI is older than this skill's `version`, update first (`npm install -g loopshouse@latest`) — the commands below assume the stamped version.

A failed check means the CLI still needs install + login. Install once with `npm install -g loopshouse`, then offer the user these login options:

- **Google**: `loops auth login --provider google` — opens the browser.
- **GitHub**: `loops auth login --provider github` — opens the browser.
- **Email one-time code**: `loops auth login --email <you@example.com>` sends a 6-digit code; verify with `loops auth verify --email <you@example.com> --code <123456>`.

In headless contexts the browser flows print a URL for a human to open. Re-run `loops auth status` to confirm before continuing.

## Read the event data

Treat this TOON document as ground truth for the event (TOON = compact JSON: `key: value` lines; a uniform array renders as a `name[N]{col1,col2,…}:` header plus one comma-separated row per element):

```toon
event:
  slug: the-nostalgic-jukebox-hack
  name: The Nostalgic Jukebox Hack
  tagline: null
  stage: build_open
  stageMeaning: Building phase — submissions are OPEN until the end date
  timezone: Asia/Calcutta
  prizeCurrency: USD
  startsAt: "Aug 15, 2026, 12:30 AM (Asia/Calcutta)"
  submissionDeadline: "Aug 16, 2026, 12:30 AM (Asia/Calcutta)"
  registrationDeadline: "Aug 15, 2026, 12:30 PM (Asia/Calcutta)"
  description: null
problems[1]:
  - title: "One Station, Any Vibe"
    slug: one-station-any-vibe
    brief: "A dhaba on a hill road, a tea stall off the highway, a trucker's cab, different places, same old craving: everyone around picks a vibe and, for a while, hears the exact same song at the exact same moment. One crew wants a 2000s Bollywood loop, another wants Northeast indie, another wants Bhojpuri classics, and next week someone will want something nobody's thought of yet. So the platform doesn't ship a fixed list of venues or themes, anyone should be able to spin up a station under whatever name or theme they want, and whoever joins that station hears the same track, in sync, no matter where they physically are. And it has to survive the reality of these places: patchy signal, phones walking…"
    successLooksLike: "Create a station under any theme name you like, get multiple devices to join it and hear the same track together in sync — even on flaky wifi, and pulling back in cleanly after a drop."
    suggestedStack[4]: Web Audio API,WebSocket or WebRTC or BroadcastChannel,Service Workers,Cache API
    judgingCriteria[1]{name,weightPct}:
      "Problem interpretation, product judgment & code craft",20
```

`event.stage` and the deadlines are snapshots from when this skill was generated and do not update — sanity-check timing before planning multi-day work.

## Budget credits

**1 credit = one ideator turn or one knowledge-graph query.** Project and artifact commands and the evaluator prompt are free. Spend credits on load-bearing questions, not browsing, and check the balance before a research burst:

```sh
loops credits --event the-nostalgic-jukebox-hack
```

## Ideate with the AI mentor

The mentor knows this contest's problems, briefs, and judging criteria, grounded in each problem's knowledge graph. Conversations persist locally per event (`~/.loops/sessions/`) and continue automatically — each call sends one more message, so ask follow-ups freely instead of cramming everything into one prompt.

```sh
loops ideate --event the-nostalgic-jukebox-hack -m "<your prompt>"
loops ideate --event the-nostalgic-jukebox-hack -m "<follow-up>"               # same conversation
loops ideate --event the-nostalgic-jukebox-hack --withProject -m "<prompt>"    # mentor sees the user's project
loops ideate --event the-nostalgic-jukebox-hack --new -m "<fresh start>"       # discard the session first
loops ideate --event the-nostalgic-jukebox-hack --problems <problemSlug> -m "<prompt>"   # focus on one problem
loops session --event the-nostalgic-jukebox-hack            # show the stored conversation (--clear to delete)
```

Pass `--withProject` once a project exists — feedback grounded in the actual build beats generic advice.

## Query problem knowledge graphs (graph-RAG)

Each problem in this contest has a knowledge graph built from its brief, resources, and reference materials. A query returns a **cited evidence block** (entities, relationships, chunks, sources) — read the evidence and compose the answer yourself, citing it. The event data above already inlines each problem's brief, success criteria, stack, and rubric — answer from it first; query the graph for reference materials and depth the inline data doesn't carry, and to fetch the full brief when the inline one ends in "…" (long briefs are clipped). 1 credit per query. One ready command per problem:

```sh
# One Station, Any Vibe
loops knowledge query --event the-nostalgic-jukebox-hack --problem one-station-any-vibe -q "<your question about One Station, Any Vibe>"
```

## Manage the project

The project IS the submission. The user has at most one here, and the platform resolves it from the session — no ids, no listings.

```sh
loops project get --event the-nostalgic-jukebox-hack       # current state (exists=false if none yet)
loops project create --event the-nostalgic-jukebox-hack --name "<name>" --repoUrl <url> --tagline "<one-liner>"
loops project update --event the-nostalgic-jukebox-hack --description "<new description>"
```

**Update is a PATCH**: only the fields you pass change — an update with just `--tagline` cannot wipe the repo URL. Fields: `--name`, `--tagline`, `--pitch`, `--description`, `--repoUrl`, `--demoUrl`, `--videoUrl`.

## Save ideation artifacts

Save ideas, problems, and tech-stack notes against this event — they appear in the user's web playground too, so persist anything worth keeping instead of letting it die in the conversation. Kinds: `idea`, `problem`, `tech-stack`, `note`.

```sh
loops artifact list --event the-nostalgic-jukebox-hack
loops artifact save --event the-nostalgic-jukebox-hack --name "<title>" --kind idea --body "<markdown body>"
loops artifact update --event the-nostalgic-jukebox-hack --id <artifactId> --body "<updated markdown>"
loops artifact remove --event the-nostalgic-jukebox-hack --id <artifactId>
```

## Evaluate the project against a problem

Fetch a self-contained evaluator prompt for one problem (free; the platform attaches the user's project record), then **execute the prompt yourself inside the project repo** — it assumes the code access you have. The prompt walks that problem's brief, success criteria, and weighted judging criteria and returns alignment feedback: verified strengths, gaps, and where to focus. Run it for every problem the project targets, well before the deadline.

```sh
# One Station, Any Vibe
loops evaluate --event the-nostalgic-jukebox-hack --problem one-station-any-vibe
```

Report the feedback to the user, then apply agreed improvements via `loops project update`.
