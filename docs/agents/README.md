# Agent construction (generic, BrainBook-ready)

This folder is a starting point for wiring BrainBook to a multi-agent setup on top of
[Hermes Agent](https://hermes-agent.nousresearch.com). It is deliberately generic: no
company names, no customer data, no real paths from any specific deployment. Copy what you
need and adapt the paths/teams to your own Mac.

BrainBook itself never runs agents. It only:
- writes Kanban cards to the Hermes gateway's board (`owner` by default) when you press **Run**
  on a task,
- reads back card status to show Queued / Running / Done / Needs you,
- shows a read-only "team" view if you wire up an `agent-feed` script (see `router-sample/`).

Everything that actually executes work is Hermes profiles + (optionally) a small Router
script that decides which worker handles which kind of task. None of this is required to use
BrainBook for personal task tracking — it only matters if you want **Run** to dispatch to more
than one coding agent.

## Pieces

| Piece | What it is | Where |
|---|---|---|
| Hermes profiles | Separate agent identities (own model, own skills, own state) | `profiles-template/` |
| Router sample | A tiny, generic "pick a worker for this task" script + config | `router-sample/` |
| Skills | Reusable procedure files Hermes loads into context when relevant | `skills/` |

## 1. Hermes profiles (multi-agent via `hermes -p <name>`)

A Hermes "profile" is just an isolated home directory (`~/.hermes/profiles/<name>/`) with its
own `config.yaml`, memory, and skills. You can give each profile a different model/provider so
cheap/fast work and hard/expensive work run on different agents without extra infrastructure.

```bash
hermes profile create researcher     # creates ~/.hermes/profiles/researcher/
hermes -p researcher                 # launches that profile's own session
```

See `profiles-template/config.yaml` for a minimal starting config (local/cheap model) and
`profiles-template/config.expensive.yaml` for a paid-tier variant (Anthropic/OpenAI). Point
`model.provider` / `model.default` at whatever you actually have access to — these are examples,
not working credentials.

A simple two-tier pattern that works well for a personal setup:

- `default` profile: your daily driver, a capable model, used for most work and all owner
  conversation.
- One or two extra profiles pointed at a free/local model (e.g. a local llama.cpp server, or a
  free tier of a hosted model) for routine, low-risk tasks.
- Route "this is genuinely hard / high-stakes" work to your best model explicitly, rather than
  defaulting everything to it — see the Router sample below for one way to automate that choice.

## 2. Router sample (generic worker selection)

`router-sample/` is a minimal, self-contained version of the pattern BrainBook's own backend
uses: a JSON config naming workers and routes, plus one script that picks a worker for a task
string. It has no dependency on any specific company's folder layout — update the paths at the
top of `route.py` and the two config files to match your machine.

```
router-sample/
  config/
    workers.json   # which workers exist, how to reach them, cost tier
    routes.json    # task-category -> worker, with fallbacks
  adapters/
    free_worker.py     # example: drives a free/local CLI coding agent
    paid_worker.py      # example: drives a paid CLI coding agent, capped per run
  route.py         # reads a task string, returns {worker, reason}
```

Wire it into BrainBook's "Run" button by having your Kanban dispatcher (or a cron job) call
`route.py "<task text>"` before launching whichever CLI agent it names. BrainBook does not need
to know about the Router at all — it only needs a working `hermes` CLI reachable at
`127.0.0.1:9119` (the Dashboard) so the agent that picks up the card can report back.

## 3. Skills

Skills are Markdown files Hermes loads into context only when relevant (based on the
description in their frontmatter). The two in `skills/` are sanitized copies of the ones used
to operate BrainBook day-to-day — company names, internal paths, and customer-specific details
have been replaced with generic placeholders (`<your vault>`, `<app root>`, `<your board>`).

Install a skill for your own Hermes profile:

```bash
mkdir -p ~/.hermes/skills/brainbook-ops
cp docs/agents/skills/brainbook-ops/SKILL.md ~/.hermes/skills/brainbook-ops/
```

Hermes picks up new skills on the next session (skills change the system prompt, so they are
not hot-loaded mid-conversation by design — this keeps prompt caching intact).

See `hermes-agent-skill-authoring` skill (built into Hermes) if you want to write your own.

## What is NOT included here

- Any production team roster, company-specific routing rules, or business data.
- API keys, tokens, or any credential. Every sample config uses placeholder values.
- The GPU/video production pipeline referenced in some skill comments — that is specific to
  one deployment's hardware and is out of scope for a generic starter kit.
