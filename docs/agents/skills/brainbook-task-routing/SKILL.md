---
name: brainbook-task-routing
description: Use when work tracked in BrainBook needs to be queued or fixed through an agent.
---

# BrainBook task routing

BrainBook (`<app root>`, local server `127.0.0.1:4183`) is your task surface. A coordinating
agent (e.g. your Hermes `default` profile) routes work created by **Run**; specialist agents or
a Router (see `docs/agents/router-sample/`) do the actual building. When a status question
("is X working?") turns up a real defect, the fix belongs as a tracked task, not as an ad hoc
one-off change nobody can see later — that's the whole point of tracking it here.

## Procedure

1. Diagnose read-only first and measure, don't guess: is the relevant service up or down
   (`lsof -nP -iTCP:<port> -sTCP:LISTEN`), when did it last update, what do the logs say.
2. A small restore that unblocks diagnosis (starting a stopped local service) is fine to do
   immediately; say so explicitly and note it is temporary if it isn't a permanent fix.
3. Write the task as JSON:
   - `title`: a short outcome statement.
   - `description`: the measured facts, a numbered list of goals, a clear pass condition, and
     any boundaries (read-only, no destructive actions, anything needing your explicit
     approval).
   - `priority`, `area`, `source` fields as your BrainBook setup expects.
4. Submit:
   ```bash
   curl -s -X POST -H 'Host: 127.0.0.1:4183' -H 'Content-Type: application/json' \
     --data @task.json http://127.0.0.1:4183/api/tasks
   ```
   The `Host` header matters if your server only accepts loopback host names. Check the
   response for the created card id and assignee.
5. Verify the handoff by checking the card actually shows up wherever your agent's work queue
   lives (Kanban board, etc).
6. Don't perform the same fix yourself in parallel — let the assigned agent do it, so two
   writers never race on the same files/data.
7. Report back: what was broken (measured), what you restored temporarily, the task/card id,
   the pass condition, and that the real result still depends on the agent's own verification.

## Pitfalls

- Diagnosis alone is not a deliverable, and neither is an untracked local fix — route it
  through the same queue everything else goes through, or it becomes invisible rework later.
- Match the task to whichever agent/team actually owns that area of code or business, rather
  than letting whichever agent is already talking to you absorb unrelated work.
