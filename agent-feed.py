"""Read recent Hermes Kanban activity for BrainBook's agent chat (Python standard library only).

Usage: python3 agent-feed.py <hermes_home> <since_unix> [limit]
       python3 agent-feed.py <hermes_home> cards [days]   (office view: open + recently done cards)
Prints JSON: {"items": [...], "boards": N}. Read-only: boards are opened with mode=ro
(or immutable=1 when a board has no WAL files and ro cannot open it). Nothing is written.
"""
import glob
import json
import time
import os
import re
import sqlite3
import subprocess
import sys
import urllib.request

KINDS = {
    "completed": "done",
    "commented": "comment",
    "blocked": "blocked",
    "gave_up": "failed",
    "crashed": "failed",
    "unblocked": "progress",
    "claimed": "progress",
    "created": "new",
}


def connect(path):
    for suffix in ("?mode=ro", "?immutable=1"):
        try:
            conn = sqlite3.connect(f"file:{path}{suffix}", uri=True, timeout=0.3)
            conn.execute("select 1 from task_events limit 1")
            return conn
        except sqlite3.Error:
            continue
    return None


def board_name(directory, slug):
    try:
        with open(os.path.join(directory, "board.json"), encoding="utf-8") as handle:
            return json.load(handle).get("name") or slug
    except (OSError, ValueError):
        return slug


def read_board(path, slug, name, since, limit):
    conn = connect(path)
    if conn is None:
        return []
    conn.row_factory = sqlite3.Row
    marks = ",".join("?" * len(KINDS))
    rows = conn.execute(
        f"""select e.id, e.task_id, e.kind, e.payload, e.created_at, t.title, t.assignee, t.result, t.created_by
            from task_events e left join tasks t on t.id = e.task_id
            where e.created_at > ? and e.kind in ({marks})
            order by e.created_at desc, e.id desc limit ?""",
        (since, *KINDS.keys(), limit),
    ).fetchall()
    items = []
    for row in rows:
        payload = {}
        try:
            payload = json.loads(row["payload"] or "{}") or {}
        except ValueError:
            pass
        author = payload.get("author") or row["assignee"] or "hermes"
        text = ""
        if row["kind"] == "commented":
            comment = conn.execute(
                # Match the event's own author so two agents commenting in the
                # same second never swap bodies.
                "select author, body from task_comments where task_id = ? and created_at <= ?"
                " and (? = '' or author = ?) order by created_at desc, id desc limit 1",
                (row["task_id"], row["created_at"] + 1, payload.get("author") or "", payload.get("author") or ""),
            ).fetchone()
            if comment:
                author, text = comment["author"], comment["body"] or ""
        elif row["kind"] == "completed":
            text = (row["result"] or "").strip() or "Task completed."
        elif row["kind"] in ("blocked", "gave_up", "crashed"):
            text = str(payload.get("reason") or payload.get("error") or row["kind"].replace("_", " ")).strip()
        elif row["kind"] == "claimed":
            text = "Started working on it."
        elif row["kind"] == "unblocked":
            text = "Unblocked — back in progress."
        elif row["kind"] == "created":
            text = "New task on the board."
        items.append({
            "id": f"{slug}:{row['id']}",
            "board": slug,
            "boardName": name,
            "taskId": row["task_id"],
            "taskTitle": row["title"] or row["task_id"],
            "kind": KINDS[row["kind"]],
            "event": row["kind"],
            "author": who(author),
            "from": instruction_sender(payload.get("from") or row["created_by"]),
            "to": who(payload.get("recipient") or payload.get("to")) if (payload.get("recipient") or payload.get("to")) else None,
            "taskRecipient": "チーム" if row["assignee"] == "team" else who(row["assignee"]) if row["assignee"] else None,
            "text": text,
            "at": row["created_at"],
        })
    conn.close()
    return items


def live(home):
    """Cards an agent is working on right now, across every board (read-only)."""
    out = []
    for path in sorted(glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db"))):
        directory = os.path.dirname(path)
        slug = os.path.basename(directory)
        conn = connect(path)
        if conn is None:
            continue
        try:
            for row in conn.execute("select id, title, assignee, started_at from tasks where status = 'running' order by started_at desc limit 20"):
                out.append({"id": row[0], "title": (row[1] or "")[:160], "assignee": who(row[2]) if row[2] else "agent", "startedAt": row[3], "board": slug, "boardName": board_name(directory, slug)})
        except sqlite3.Error:
            pass
    for job in movie_activity():
        out.append({"id": job["id"], "title": job["title"], "assignee": job["member"], "startedAt": job["startedAt"],
                    "board": "movie", "boardName": "MoviePro", "gpu": job["gpu"], "queue": comfy_queue() if job["gpu"] else None})
    out.extend(session_activity(home))
    print(json.dumps({"running": out}, ensure_ascii=False))


# Owner 2026-09-30: "while you work in this terminal the app must move too; it only
# shows movie-pro". Terminal / Telegram / Dashboard sessions are not Kanban cards, so
# the live list read only cards and movie processes. A session is live when it wrote
# a message in the last 3 minutes. The label is the project the session is touching
# (paths in its recent tool calls), never raw chat text (owner: no raw information).
SESSION_LIVE_SECONDS = 180
PROJECT_LABELS = [
    ("/Personal/task-system", "BrainBook app"),
    ("/EnglishContentOS", "MoviePro (lesson videos)"),
    ("/Character-reference", "character references"),
    ("/Upclass/", "UPCLASS"),
    ("/HSAcademy/", "H&S Academy app"),
    ("/AccountingGroup", "AccountPro"),
    ("/IgatayaDB", "Igataya data"),
    ("/IgataCarRental", "Igataya rent-a-car web"),
    ("/Mitumorikun", "Mitumorikun"),
    ("/ObsidianVault/", "Obsidian notes"),
    ("/AI/router", "AI Router"),
    ("/Hermes3D", "Hermes 3D"),
    ("/Blog/", "blogs"),
    ("/.hermes/skills", "Hermes skills"),
    ("/Documents/Hermes", "Hermes"),
]
SOURCE_LABEL = {"cli": "terminal", "telegram": "Telegram", "dashboard": "Dashboard", "api_server": "Dashboard", "desktop": "desktop app"}


def _session_project(conn, session_id):
    counts = {}
    try:
        rows = conn.execute("select tool_calls from messages where session_id = ? and tool_calls is not null order by timestamp desc limit 25", (session_id,)).fetchall()
    except sqlite3.Error:
        return None
    for (calls,) in rows:
        text = calls or ""
        for marker, label in PROJECT_LABELS:
            if marker in text:
                counts[label] = counts.get(label, 0) + 1
                break
    return max(counts, key=counts.get) if counts else None


def session_activity(home):
    now = time.time()
    dbs = [(os.path.join(home, "state.db"), "Bigkiji")]
    dbs += [(path, who(os.path.basename(os.path.dirname(path)))) for path in glob.glob(os.path.join(home, "profiles", "*", "state.db"))]
    out = []
    for path, agent in dbs:
        if not os.path.exists(path) or now - os.path.getmtime(path) > SESSION_LIVE_SECONDS + 60:
            continue
        try:
            conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=0.3)
        except sqlite3.Error:
            continue
        try:
            rows = conn.execute(
                "select s.id, s.source, s.started_at, max(m.timestamp) from sessions s join messages m on m.session_id = s.id "
                "where m.timestamp > ? and s.ended_at is null and coalesce(s.source, '') not in ('cron', 'kanban', 'subagent', 'meeting') "
                "group by s.id order by max(m.timestamp) desc limit 4", (now - SESSION_LIVE_SECONDS,)).fetchall()
        except sqlite3.Error:
            rows = []
        for session_id, source, _started, last in rows:
            project = _session_project(conn, session_id)
            where = SOURCE_LABEL.get(source or "", source or "session")
            out.append({"id": f"session:{session_id}", "title": f"Working on {project}" if project else "Working with you",
                        "assignee": agent, "startedAt": int(last or now), "board": "session",
                        "boardName": f"Hermes {where}", "session": True})
    return out


# MoviePro work that runs as local processes, not as a running Kanban card
# (owner 2026-09-30: "MoviePro only ever shows MovieProTop-Mame and ComfyUI; are QA and the
# other agents synced?"). Measured the same day: during a lesson-video run the
# chain spends about 40% of its time in cut QA (Whisper + Vision, 7 min per cut),
# which BrainBook never showed. Each rule maps a process to the member that owns
# that work; the process list is the truth, like gpu_work() below.
MOVIE_PROCESSES = [
    # (member, markers, what it is)
    ("ComfyUI", ("gpu_job_supervisor", "bku-gpu-run", "face_turnaround.py", "hero_portrait.py", "master_sheet.py"), "gpu"),
    ("Auto QA", ("cut_qa.py", "keyframe_qa.py", "unit_gate.py", "whisper-cli"), "qa"),
    ("Vision", ("llama-mtmd-cli", "/bin/ai-see"), "vision"),
    ("MovieProTop-Mame", ("campaign28_chain.sh", "campaign28_generate.py", "charref_finish.sh"), "chain"),
]
GPU_RUNNERS = MOVIE_PROCESSES[0][1]


def _process_table():
    try:
        table = subprocess.run(["/bin/ps", "-axo", "pid=,ppid=,etime=,command="], capture_output=True, text=True, timeout=2).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    rows = []
    for line in table.splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) == 4 and "grep" not in parts[3] and "agent-feed.py" not in parts[3]:
            rows.append(parts)
    return rows


def _movie_title(member, command):
    unit = re.search(r"(?:授業動画/|--units? )([A-Za-z0-9_]+)", command)
    cut = re.search(r"授業動画/[A-Za-z0-9_]+ +([0-9]{2}_[a-z0-9_]+)", command)
    where = f"{unit.group(1)}{'/' + cut.group(1) if cut else ''}" if unit else ""
    target = re.search(r"(hero_portrait|face_turnaround|master_sheet)\.py\s+([a-z0-9_-]+)", command)
    if member == "ComfyUI":
        if target:
            return f"Character reference: {target.group(2)} ({target.group(1).replace('_', ' ')})"
        return "GPU render" + (f": {where}" if where else "")
    if member == "Auto QA":
        kind = "Keyframe QA" if "keyframe_qa" in command else "Unit gate" if "unit_gate" in command else "Speech check (Whisper)" if "whisper" in command else "Cut QA"
        return kind + (f": {where}" if where else "")
    if member == "Vision":
        return "Vision model is looking at frames for Auto QA"
    if "charref" in command:
        return "Character-reference batch"
    return "MoviePro: lesson video chain" + (f" ({where})" if where else "")


def movie_activity():
    """Live MoviePro work, one entry per member (read-only process scan)."""
    rows = _process_table()
    out, seen = [], set()
    for member, markers, kind in MOVIE_PROCESSES:
        hits = [r for r in rows if any(m in r[3] for m in markers)]
        if not hits or member in seen:
            continue
        seen.add(member)
        # The oldest matching process is the outermost runner.
        pid, _ppid, etime, command = max(hits, key=lambda r: etime_seconds(r[2]))
        # Prefer the most specific command for the title (a child names the cut).
        detail = next((r[3] for r in hits if "授業動画/" in r[3]), command)
        out.append({"id": f"{kind}-{pid}", "member": member, "kind": kind, "title": _movie_title(member, detail)[:160],
                    "startedAt": int(time.time()) - etime_seconds(etime), "gpu": kind == "gpu"})
    return out


def gpu_work():
    """GPU work that has no running Kanban card (read-only).

    Measured 2026-09-29: charref_finish.sh renders characters through
    bku-gpu-run while its movie card stays `ready`, so BrainBook said "no agent
    is working" during a live ComfyUI render. The process list is the truth;
    ComfyUI's queue (1 s timeout) only confirms it is busy.
    """
    out = []
    for job in movie_activity():
        if job["gpu"]:
            out.append({"id": f"gpu-{job['id']}", "title": job["title"], "assignee": "ComfyUI", "startedAt": job["startedAt"],
                        "board": "movie", "boardName": "MoviePro", "gpu": True, "queue": comfy_queue()})
    return out


def etime_seconds(value):
    days, _, rest = value.rpartition("-")
    numbers = [int(x) for x in rest.split(":")]
    while len(numbers) < 3:
        numbers.insert(0, 0)
    return (int(days) if days else 0) * 86400 + numbers[0] * 3600 + numbers[1] * 60 + numbers[2]


def comfy_queue():
    for port in (8189, 8188):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/queue", timeout=1) as response:
                data = json.load(response)
            return {"port": port, "running": len(data.get("queue_running", [])), "pending": len(data.get("queue_pending", []))}
        except (OSError, ValueError):
            continue
    return None


# Yuma is the owner, not an agent: every owner-side or pseudo identifier (a
# request's created_by, a probe/e2e run, a human-review pause, a team-lane
# card's own "team" assignee) resolves to Bigkiji, the hub that receives
# tasks and takes them back.
AGENT_NAME = {"default": "Bigkiji", "hermes": "Bigkiji", "worker": "Bigkiji", "brainbook": "Bigkiji", "user": "Bigkiji",
              "owner": "Bigkiji", "e2e": "Bigkiji", "probe": "Bigkiji", "human_review": "Bigkiji", "terminal": "Bigkiji",
              "team": "Bigkiji", "yuma": "Bigkiji",
              "router": "Router", "auto-decomposer": "Decomposer", "mimo": "MiMo", "claude": "Claude Code",
              "claudecode": "Claude Code", "codex": "Codex", "qwen": "Qwen (local)", "vision": "Vision",
              "opencode": "OpenCode", "supportpro": "Pi",
              "moviepro": "MovieProTop-Mame", "kuro": "Kuro", "eduleadpro": "Shimajiro", "eduresearchpro": "Ame", "gpupro": "Maru",
              # `creativepro` is the live profile (renamed 2026-10-17); `blogpro` stays mapped so
              # cards filed before the rename still print the lead's current display name.
              "creativepro": "CreativeProTop-Momo", "blogpro": "CreativeProTop-Momo",
              "apppro": "AppProTop-Sora", "accountpro": "AccountProTop-Riku", "classpro": "ClassProTop-Nana",
              "investment": "InvestProTop-Rin", "igataya-web": "RentProTop-Kai", "marketing": "MarketProTop-Yui",
              "securitypro": "SecurityProTop-Taiga"}
KANBAN_OUTCOME = {"running": "working", "ready": "queued", "todo": "waiting", "triage": "queued", "scheduled": "scheduled", "blocked": "needs you", "done": "done", "archived": "done", "complete": "done", "completed": "done", "failed": "failed"}


ROUTER_WORKERS = {"mimo", "claude", "codex", "qwen", "hermes", "vision", "human_review", "opencode"}


def who(name):
    # Every caller funnels through here, so normalising case/whitespace and
    # mapping owner/pseudo identities to Bigkiji here is enough to keep them
    # out of every mode (items, live, flow, teams) — no per-caller filtering.
    key = " ".join((name or "").split()).lower()
    if not key:
        return "unknown"
    return AGENT_NAME.get(key, " ".join((name or "").split()))


def instruction_sender(name):
    key = " ".join((name or "").split()).lower()
    if not key or key in ("unknown", "team", "probe", "e2e"):
        return "指示元未記録"
    if key in ("yuma", "owner", "user", "you"):
        return "Yuma" if key == "yuma" else "オーナー"
    return who(name)


def flow(home, since, router_jobs):
    """Who handed which task to whom, and what happened (read-only, all boards + Router receipts)."""
    handoffs = []
    for path in sorted(glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db"))):
        directory = os.path.dirname(path)
        slug = os.path.basename(directory)
        conn = connect(path)
        if conn is None:
            continue
        try:
            parent_of = {}
            for parent, child, passignee in conn.execute("select l.parent_id, l.child_id, p.assignee from task_links l join tasks p on p.id = l.parent_id"):
                parent_of[child] = passignee
            rows = conn.execute(
                """select t.id, t.title, t.assignee, t.status, t.created_by, t.body, t.created_at, t.started_at, t.completed_at,
                          (select r.outcome from task_runs r where r.task_id = t.id order by r.started_at desc limit 1),
                          (select r.summary from task_runs r where r.task_id = t.id order by r.started_at desc limit 1),
                          (select count(*) from task_runs r where r.task_id = t.id)
                   from tasks t
                   where t.status = 'running' or coalesce(t.completed_at, t.started_at, t.created_at) > ?
                   order by coalesce(t.completed_at, t.started_at, t.created_at) desc limit 40""",
                (since,),
            ).fetchall()
        except sqlite3.Error:
            continue
        for tid, title, assignee, status, created_by, body, created_at, started_at, completed_at, outcome, summary, runs in rows:
            giver = created_by  # Issuer is a recorded field, never a parent/hierarchy inference.
            team_short = None
            reported_by = None
            to_name = who(assignee)
            if assignee == "team":
                # A team-lane card carries `team: <name>` in its body; the member
                # actually working is whoever last commented on it.
                hint = next((line.split(":", 1)[1].strip() for line in (body or "").splitlines() if line.lower().startswith("team:")), None)
                team_short = team_short_name(hint)
                comment = conn.execute(
                    "select payload from task_events where task_id = ? and kind = 'commented' order by created_at desc, id desc limit 1",
                    (tid,),
                ).fetchone()
                member = None
                if comment:
                    try:
                        member = (json.loads(comment[0] or "{}") or {}).get("author")
                    except ValueError:
                        member = None
                reported_by = who(member) if member else None
                to_name = team_short or "チーム（担当者未記録）"
            handoff = {
                "id": f"{slug}:{tid}", "source": "kanban", "board": slug, "boardName": board_name(directory, slug),
                "from": instruction_sender(giver), "to": to_name, "title": (title or ""), "state": KANBAN_OUTCOME.get(status, status),
                "active": status == "running", "at": completed_at or started_at or created_at,
                "note": ((summary or "")[:220] if status in ("done", "blocked") else (f"attempt {runs}" if runs and runs > 1 else "")),
                "activityKind": "card", "cardIdentity": {"board": slug, "id": tid}, "senderBasis": "card.created_by", "outcome": outcome, "recipientKind": "team" if assignee == "team" else "agent", "reportedBy": reported_by,
            }
            if team_short:
                handoff["team"] = team_short
            handoffs.append(handoff)
    for folder in ("running", "receipts"):
        for file in sorted(glob.glob(os.path.join(router_jobs, folder, "*.json")), key=os.path.getmtime, reverse=True)[:30]:
            if os.path.getmtime(file) < since and folder != "running":
                continue
            try:
                with open(file, encoding="utf-8") as handle:
                    job = json.load(handle)
            except (OSError, ValueError):
                continue
            route = job.get("route") or job.get("owner") or job.get("worker")
            if route not in ROUTER_WORKERS:
                route = "router"
            failures = job.get("failures") or []
            status = job.get("status")
            # A "running" file untouched for 2h is a leftover, not live work.
            # Receipts keep their last status forever; only a file in jobs/running/ is live work.
            live_file = os.path.exists(os.path.join(router_jobs, "running", os.path.basename(file)))
            stale = status == "running" and (not live_file or time.time() - os.path.getmtime(file) > 7200)
            if stale:
                status = "stale"
            steps = [{"to": who(route), "state": "failed" if failures else ("left over" if stale else KANBAN_OUTCOME.get(status, status or ""))}]
            nxt = str(job.get("next_action") or "")
            if failures and nxt.startswith("retry on "):
                steps.append({"to": who(nxt[len("retry on "):].strip()), "state": "working" if status == "running" else ("left over" if stale else status or "")})
            handoffs.append({
                "id": f"router:{job.get('task_id')}", "source": "router", "board": "router", "boardName": "AI Router",
                "from": instruction_sender(job.get("source")), "to": steps[-1]["to"], "title": str(job.get("objective") or job.get("task") or "")[:160],
                "state": steps[-1]["state"], "active": status == "running", "at": int(os.path.getmtime(file)),
                "activityKind": "router", "senderBasis": "router_job.source",
                "toDepartment": str(job.get("team") or "") if isinstance(job.get("team"), str) else "",
                **({"progress": {k: job["progress"][k] for k in ("percent", "completed", "total", "unit", "at", "basis") if k in job["progress"] and isinstance(job["progress"][k], (str, int, float))}} if isinstance(job.get("progress"), dict) else {}),
                **({"eta": {k: job["eta"][k] for k in ("finishAt", "at", "basis") if k in job["eta"] and isinstance(job["eta"][k], (str, int, float))}} if isinstance(job.get("eta"), dict) else {}),
                **({"stage": job["stage"]} if isinstance(job.get("stage"), str) else {}),
                "note": ("; ".join(str(f) for f in failures) or (job.get("reason") or ""))[:200], "steps": steps,
            })
    # bin/submit writes a pre-dispatch receipt that keeps status "running" after the worker's own
    # receipt finishes; drop that leftover when a finished receipt for the same objective exists.
    finished = {(item["from"], item["title"]) for item in handoffs if item["source"] == "router" and item["state"] not in ("left over", "working")}
    handoffs = [item for item in handoffs if not (item["source"] == "router" and item["state"] == "left over" and (item["from"], item["title"]) in finished)]
    # Live MoviePro work is team work even when its card is still `ready` (see movie_activity).
    for job in movie_activity():
        queue = comfy_queue() if job["gpu"] else None
        note = (f"ComfyUI :{queue['port']} · {queue['running']} running, {queue['pending']} waiting" if queue else "GPU lease active") if job["gpu"] else "local process"
        # No `team` key on purpose: the board above is already named MoviePro, and `handoff.team` wins
        # over `boardName` wherever a team is printed (the live strip, the hand-off log), so the raw id
        # `movie` this used to carry is what the owner read instead of the team. The script lane's own
        # cards arrive with `team: movie-pro` and are named through team_short_name — the same team.
        handoffs.append({"id": job["id"], "source": "kanban", "board": "movie", "boardName": "MoviePro", "from": "指示元未記録",
                         "to": job["member"], "title": job["title"], "state": "working", "active": True, "at": job["startedAt"],
                         "activityKind": "gpu" if job["gpu"] else "process", "note": note, "steps": [{"to": job["member"], "state": "working"}]})
    # Session activity records a recipient, but does not prove who instructed it.
    for job in session_activity(home):
        handoffs.append({"id": job["id"], "source": "session", "board": "session", "boardName": job["boardName"], "from": "指示元未記録",
                         "to": job["assignee"], "title": job["title"], "state": "working", "active": True, "at": job["startedAt"],
                         "activityKind": "session", "note": "", "steps": [{"to": job["assignee"], "state": "working"}], "team": None})
    seen, out = set(), []
    for item in sorted(handoffs, key=lambda item: (not item["active"], -(item["at"] or 0))):
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        out.append(item)
    agents = {}
    for item in out:
        for name in [item["from"], item["to"], *[step["to"] for step in item.get("steps", [])]]:
            if name == item["to"] and item.get("recipientKind") == "team":
                continue
            if name in ("You", "Yuma", "オーナー", "指示元未記録", "担当者未記録", "unknown"):   # the owner as sender of a live Hermes session, not an agent
                continue
            agents.setdefault(name, {"name": name, "active": False, "count": 0})
            agents[name]["count"] += 1
        if item["active"] and item["to"] in agents:
            agents[item["to"]]["active"] = True
    print(json.dumps({"handoffs": out[:40], "agents": sorted(agents.values(), key=lambda a: (not a["active"], -a["count"]))}, ensure_ascii=False))


# Short team names for the left menu (owner 2026-09-29: "MoviePro, AppPro, ClassPro...").
# `movie-pro` sits beside `movie` on purpose. That Router team is MoviePro's script-fix lane, not a
# department of its own (owner 2026-10-02, "まとめて"; MOVIE_SCRIPT_TEAM below), so a feed that names
# the team a piece of work belongs to has to be able to print the lane as MoviePro. It cannot bring a
# second card back: `teams()` skips the lane before it ever reads this table, so the name here is only
# ever reached through team_short_name.
TEAM_SHORT = {"app-dev": "AppPro", "accountpro": "AccountPro", "hs-school-ops": "ClassPro",
              # The `marketing` Router lane is the Marketing team inside CreativePro (owner
              # 2026-10-17), not a department of its own, so the tab says which department it sits in.
              "investment": "InvestPro", "igataya-web": "RentPro", "marketing": "CreativePro Marketing",
              "movie": "MoviePro", "movie-pro": "MoviePro", "securitypro": "SecurityPro"}


def team_short_name(team_id):
    """What a team is called on screen, for any feed that names the team a piece of work is in.

    One function, so a lane id cannot reach the live strip or the hand-off log. MoviePro's own work
    used to be announced as `movie` and its script lane as `movie-pro` — two raw ids for one team, on
    the two surfaces where every other team read "AppPro" — which is the split this closes. An id the
    table has not seen keeps its own text, so a team added to the Router registry tomorrow is still
    shown rather than blanked, and `None` stays `None` so a card with no team hint adds no team name.
    """
    return TEAM_SHORT.get(team_id, team_id)


# Every team has the same crew; the role says what each one does there.
TEAM_CREW = [("Bigkiji", "routes and reports"), ("Pi", "support: brief + checks"), ("MiMo", "builder"),
             ("Space Bunny", "UI"), ("Claude Code", "debug first (reproduce + root cause), then QA; difficult"), ("Jev", "decision support")]
# Hierarchy inside a Router team, as bin/team-run runs it: Bigkiji routes; Pi briefs and
# checks; MiMo / Space Bunny build; Claude Code runs QA and debug; Jev advises Bigkiji.
TEAM_PARENT = {"Bigkiji": None, "Pi": "Bigkiji", "Jev": "Bigkiji", "MiMo": "Pi", "Space Bunny": "Pi", "Claude Code": "Bigkiji"}
# MoviePro: MovieProTop-Mame directs; the scenario/audio departments run on MovieProTop-Mame's profile; Auto QA
# drives the Vision check; ComfyUI is operated by Maru's GPU lane.
MOVIE_PARENT = {"MovieProTop-Mame": None, "HideoKojima": "MovieProTop-Mame", "RyūichiSakamoto": "MovieProTop-Mame", "Kuro": "MovieProTop-Mame", "Shimajiro": "MovieProTop-Mame",
                "Ame": "Shimajiro", "Maru": "MovieProTop-Mame", "Auto QA": "MovieProTop-Mame", "ComfyUI": "Maru",
                "MiMo": "MovieProTop-Mame", "Space Bunny": "MovieProTop-Mame"}
ROUTER_TO_MEMBER = {"mimo": "MiMo", "claude": "Claude Code", "hermes": "Bigkiji", "supportpro": "Pi"}
# Owner 2026-10-02 ("まとめて"): MoviePro is ONE team. The Router team `movie-pro` is MoviePro's
# script-fix lane, not a separate department, so its crew and its live jobs are folded into the one
# MoviePro card below instead of being emitted a second time. Nothing in the Router config changes —
# display only.
MOVIE_SCRIPT_TEAM = "movie-pro"
# The lane's two members, in the order they read under MovieProTop-Mame. Which model each one really runs is
# read from the Router config (workers.yaml mimo, adapters/mimo ui), never written here.
MOVIE_SCRIPT_CREW = [("MiMo", "Builds scripts through Router"), ("Space Bunny", "Script review through Router; qualification required")]
# MiMo is the lane's build entry point and stays directly instructable from this card; Space Bunny
# only checks, and was never a direct target on the lane card. Must match directTarget in server.mjs.
MOVIE_SCRIPT_DIRECT = ["MiMo"]
# MoviePro's production crew (ComfyUI/MovieProduction/AGENTS.md) and its department skills.
MOVIE_CREW = [("MovieProTop-Mame", "production director"), ("HideoKojima", "scenario and world"),
              ("RyūichiSakamoto", "audio"), ("Kuro", "independent review"), ("Shimajiro", "education brief"),
              ("Ame", "education research"), ("Maru", "GPU operation"), ("Auto QA", "automatic QA: cut, keyframe, unit gate"),
              ("ComfyUI", "image and video generation (GPU)")]
# Members the owner can instruct directly from BrainBook (server.mjs owns the
# name -> Hermes profile mapping). HideoKojima and RyūichiSakamoto are
# departments that run under MovieProTop-Mame's profile, so they are reached through MovieProTop-Mame.
MOVIE_DIRECT = ["MovieProTop-Mame", "Kuro", "Ame", "Shimajiro", "Maru"]
MOVIE_PROFILE = {"moviepro": "MovieProTop-Mame", "kuro": "Kuro", "eduleadpro": "Shimajiro", "eduresearchpro": "Ame", "gpupro": "Maru"}
# CreativePro (owner 2026-10-17: BlogPro renamed, MarketPro merged in as the Marketing team;
# originally owner 2026-09-29): blogs, SNS and AI influencer. Lead is the `creativepro` profile,
# displayed CreativeProTop-Momo. The internal team id stays `blog` — it is an identifier the
# tests, the flow map and the office all key on, and only the display name was renamed.
# Publication always waits for Yuma, so this group is shown but never auto-dispatched.
CREATIVE_CREW = [("CreativeProTop-Momo", "lead: content and SNS"), ("Coco", "AI influencer"), ("Blog QA", "H&S blog 95-point gate"),
                 ("Tech Blog QA", "tech blog 95-point gate")]
# Both profile ids resolve to the same lead: cards filed before the rename still exist.
CREATIVE_PROFILE = {"creativepro": "CreativeProTop-Momo", "blogpro": "CreativeProTop-Momo"}
CREATIVE_SKILLS = ["blog pipeline", "sns studio", "influencer studio", "blog qa", "tech blog qa"]
CREATIVE_QUEUE = os.path.expanduser("~/Documents/AI/AgentsDB/Admin/SNSStudioSora/_queue")
MOVIE_SKILLS = ["film scenario", "film preproduction", "film identity", "movie character reference",
                "movie video generation", "film review"]
# MoviePro's own chain, beside the crew it names (owner 2026-10-02, "まとめて"). It is the film
# production line with the script lane inside it, because MoviePro is one team: the lane is where the
# lesson script is built and checked, between the departments that write it and the GPU that renders it.
# This used to be the Router lane's chain behind a "Script work only:" prefix, so the one card that had to
# speak for both halves of the team headlined the smaller half's process while its own label and its
# fifteen members said something else. Length here is a layout fact, not a writing preference: the band
# is pinned above the crew in a sheet that must not scroll, so it stays one line at 1440
# (scripts/test-team-sheet-fit.mjs measures it at 1440x700 and 390x844).
MOVIE_WORKFLOW = ("MovieProTop-Mame directs → brief and research → scenario and audio → MiMo builds the script, "
                  "Space Bunny checks it → keyframes and video on the GPU → Auto QA gate → final unit")


# Which model each member really runs (owner 2026-09-30: "write the LLM under each name").
# Read live from the owning configs so the label follows a config change: Hermes profile
# config.yaml (model.default), Router config/workers.yaml, Router adapters/mimo (UI lane).
# Members with no config of their own (tools, departments) name the files that prove it.
PROFILE_OF = {"Bigkiji": None, "MovieProTop-Mame": "moviepro", "Kuro": "kuro", "Ame": "eduresearchpro", "Shimajiro": "eduleadpro",
              "Maru": "gpupro", "CreativeProTop-Momo": "creativepro", "Tora": "appdebugpro", "Hana": "hana",
              "AppProTop-Sora": "apppro", "AccountProTop-Riku": "accountpro", "ClassProTop-Nana": "classpro",
              "InvestProTop-Rin": "investment", "RentProTop-Kai": "igataya-web", "MarketProTop-Yui": "marketpro",
              "SecurityProTop-Taiga": "securitypro"}


def _profile_model(home, profile):
    path = os.path.join(home, "config.yaml") if profile is None else os.path.join(home, "profiles", profile, "config.yaml")
    try:
        with open(path, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except OSError:
        return None
    in_model = False
    for line in lines:
        if line.startswith("model:"):
            in_model = True
            continue
        if in_model and line and not line.startswith(" "):
            break
        if in_model and line.strip().startswith("default:"):
            raw = line.split(":", 1)[1].strip()
            return None if raw in ("", "null", "Null", "NULL", "~") else raw.strip("'\"") or None
    return None


def _pretty(model):
    if not model:
        return None
    table = [("claude-opus", "Claude Opus"), ("sonnet", "Claude Sonnet"), ("gpt-4o", "GPT-4o"),
             ("Qwen3.8-27B", "Qwen3.8 27B · local"), ("Ornith-1.5-35B", "Ornith 1.5 35B · local"),
             ("Qwen2.5-VL-7B", "Qwen2.5-VL 7B · local"), ("mimo-v2.6-flash", "MiMo v2.6 Flash"),
             ("space-bunny", "Space Bunny (OpenCode)"), ("nemotron-3-ultra", "Nemotron 3 Ultra")]
    for marker, label in table:
        if marker.lower() in model.lower():
            if marker == "claude-opus":
                version = model.split("claude-opus-", 1)[-1].replace("-", ".")
                return f"Claude Opus {version}"
            return label
    return model


def member_models(home, router_config):
    out = {name: _pretty(_profile_model(home, profile)) for name, profile in PROFILE_OF.items()}
    try:
        with open(os.path.join(router_config, "workers.yaml"), encoding="utf-8") as handle:
            workers = json.load(handle)
        workers = workers.get("workers", workers)
    except (OSError, ValueError):
        workers = {}
    mimo = workers.get("mimo") or {}
    build, backup = _pretty(mimo.get("model")), _pretty(mimo.get("backup_model"))
    # MoviePro's script lane runs on this worker's configured model, so the text is read here and
    # never written in the display. An absent `mimo` worker therefore leaves the lane with no model
    # line (as `vision` below does) instead of raising on `None + str`, which failed the whole
    # command and emptied the team list — the one card the owner is looking for.
    out["MiMo"] = f"{build} (backup {backup})" if build and backup else build
    ui = None
    try:
        with open(os.path.join(os.path.dirname(router_config), "adapters", "mimo"), encoding="utf-8") as handle:
            ui = next((line.split('"')[3] for line in handle if '"ui": (' in line), None)
    except (OSError, IndexError):
        pass
    out["Space Bunny"] = _pretty(ui) or "Space Bunny (OpenCode)"
    # Claude Code's identity is the Router worker config (workers.yaml claude), so a model swap
    # there shows up in BrainBook on the next read. The literal is only the no-config fallback.
    out["Claude Code"] = _pretty((workers.get("claude") or {}).get("model")) or "Claude Sonnet (high) · Opus for difficult"
    out["Vision"] = _pretty((workers.get("vision") or {}).get("model"))
    out["Qwen (local)"] = "Qwen3.8 27B · local"                        # config/resources.yaml qwen_model
    out["Router"] = "vLLM Semantic Router + rules"                      # workers.yaml semantic_router
    out["Pi"] = "No LLM (scripts only)"                                 # bin/pi-support: "no model used"
    out["Jev"] = "jev-1.13.0 (typesafe.ai)"                             # adapters/typesafe-jev
    out["Auto QA"] = "Whisper large-v3-turbo + Qwen2.5-VL 7B"           # media/scripts/cut_qa.py
    out["ComfyUI"] = "Qwen-Image-Edit 2511 + LTX-2.5 22B"               # gen_keyframe.py, ltx25-golden.json
    out["HideoKojima"] = out["RyūichiSakamoto"] = out.get("MovieProTop-Mame")      # departments on MovieProTop-Mame's profile
    for name in ("Coco", "Blog QA", "Tech Blog QA"):                    # skills run by the creativepro profile
        out[name] = out.get("CreativeProTop-Momo")
    return {name: model for name, model in out.items() if model}


def role_labels(team):
    """One team's own role files as the short chips the sheet shows, in registry order.

    Read from the Router registry, so a role file added or renamed there follows on the next read.
    Every card goes through here rather than writing its own list: MoviePro is one card but two
    registry entries (the film unit and the `movie-pro` script lane), and a per-card literal would
    have dropped the lane's role files from the display without anyone noticing (codebase-design:
    one implementation pays back across every caller).
    """
    out = []
    for rel in team.get("roles") or []:
        base = rel if str(rel).startswith("/") else os.path.join(team.get("root") or "", rel)
        out.append(os.path.splitext(os.path.basename(base))[0].split("-", 1)[-1].replace("-", " "))
    return out


def team_jobs(team, live_by_root):
    """Live Router jobs under one registry team's roots. Empty when the team has none."""
    roots = {os.path.realpath(team["root"])} | {os.path.realpath(r) for r in (team.get("roots") or {}).values()}
    return [job for root in roots for job in live_by_root.get(root, [])]



# Organizational display only. Worker selection remains exclusively in Router.
# InvestPro is excluded while its owner rebuilds that team separately.
REVIEWED_TEAM_IDS = {"app-dev", "accountpro", "hs-school-ops", "igataya-web", "marketing", "movie"}
# The chain every Router lane shows. MoviePro is the one reviewed card that does not run this one, and it
# carries MOVIE_WORKFLOW instead: a chain is a claim about the whole team it heads, so a card may not
# borrow another team's chain and qualify the difference with a prefix (see MOVIE_WORKFLOW).
ROUTER_WORKFLOW = ("Bigkiji → Pi preparation → Router selection → implementation → Pi checks → "
                   "qualified review → bounded repair or delivery → task cleanup")


def reviewed_structure(team):
    if team.get("id") not in REVIEWED_TEAM_IDS:
        return
    film = team["id"] == "movie"
    if film and not any(m["name"] == "MiMo" for m in team["members"]):
        return  # No registered script lane: do not invent one.
    previous = {m["name"]: m for m in team["members"]}
    leader = "MovieProTop-Mame" if film else "Bigkiji"
    crew = [
        ("Pi", leader, "Prepares context, runs checks and cleans up task processes", "Local scripts; no model selection"),
        ("Router", "Pi", "Selects workers by task, tools, current free eligibility and capability", "Router / Themis"),
        ("MiMo", "Router", "Builds scripts through Router" if film else "Implementation through Router; configured model is not proof of availability", None),
        ("Space Bunny", "Router", "Script review through Router; qualification required" if film else "UI through Router; configured model is not proof of availability", None),
        ("QA / Debug", "Router", "Review requires defect evidence and a qualified free model", "Selected per task; qualification required"),
        ("Jev", leader, "Optional bounded advice; never worker selection or approval", "Only when opted in and within the task budget"),
    ]
    if film:
        team["members"] = [m for m in team["members"] if m["name"] not in {row[0] for row in crew}]
    else:
        team["members"] = [dict(previous.get("Bigkiji", {}), name="Bigkiji", parent=None,
                                role="Owns the request, scope and delivery")]
    for name, parent, role, model in crew:
        member = dict(previous.get(name, {}), name=name, parent=parent, role=role)
        # A queued/running card does not establish which support process ran.
        member["live"] = bool(previous.get(name, {}).get("live")) if name in ("MiMo", "Space Bunny") else False
        member["description"] = role
        if model is not None and name == "QA / Debug":
            member["model"] = model
        team["members"].append(member)
    if not film:
        for name, member in previous.items():
            if name not in {"Bigkiji", "Pi", "Router", "MiMo", "Space Bunny", "QA / Debug", "Jev", "Claude Code"}:
                team["members"].append(dict(member, parent="Bigkiji", role=member["role"] + " (configured specialist role; task dispatch is separate)"))
        team["direct"] = [name for name in team.get("direct", []) if name != "Claude Code"]
    team["workflow"] = MOVIE_WORKFLOW if film else ROUTER_WORKFLOW
    team["workflow_note"] = "Structure describes the workflow. Each task still needs successful preparation, skill-load, check and review receipts. Role files are instructions, not additional running employees."


def teams(home, router_config, router_jobs):
    """Specialist teams with who is live right now (read-only)."""
    try:
        with open(os.path.join(router_config, "teams.yaml"), encoding="utf-8") as handle:
            registry = json.load(handle).get("teams", {})
    except (OSError, ValueError):
        registry = {}
    live_by_root = {}
    for file in glob.glob(os.path.join(router_jobs, "running", "*.json")):
        if time.time() - os.path.getmtime(file) > 7200:
            continue
        try:
            with open(file, encoding="utf-8") as handle:
                job = json.load(handle)
        except (OSError, ValueError):
            continue
        member = ROUTER_TO_MEMBER.get(str(job.get("route") or ""))
        if job.get("team_role") == "ui" or "space-bunny" in str(job.get("model") or ""):
            member = "Space Bunny"
        scope = [str(p) for p in (job.get("write_scope") or [])] + [str(job.get("working_directory") or "")]
        for root in {os.path.realpath(p.rstrip("/")) for p in scope if p}:
            live_by_root.setdefault(root, []).append({"member": member, "title": str(job.get("objective") or "")[:120].split("\n")[0]})
    # Team lane cards (assignee "team") carry `team: <name>` in their body.
    live_team_cards = {}
    for path in glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db")):
        conn = connect(path)
        if conn is None:
            continue
        try:
            for title, body, status in conn.execute("select title, body, status from tasks where assignee = 'team' and status in ('running','ready','blocked')"):
                hint = next((line.split(":", 1)[1].strip() for line in (body or "").splitlines() if line.lower().startswith("team:")), None)
                if hint:
                    live_team_cards.setdefault(hint, []).append({"title": (title or "")[:120], "state": KANBAN_OUTCOME.get(status, status)})
        except sqlite3.Error:
            pass
    out = []
    # The script-fix lane is MoviePro's own lane (owner 2026-10-02), so it is measured here and
    # folded into the MoviePro card below rather than emitted as a card of its own.
    script_team = registry.get(MOVIE_SCRIPT_TEAM)
    script_jobs = team_jobs(script_team, live_by_root) if script_team else []
    # The lane's Kanban cards are collected here too, not only its Router jobs: `team: movie-pro` is
    # the body tag server.mjs writes, and those cards used to show on the `movie-pro` card. Skipping
    # the team in the loop below must not make a card the owner just sent to MiMo disappear from the
    # team it was sent to, so the merged MoviePro card is given the cards as well as the jobs.
    script_cards = live_team_cards.get(MOVIE_SCRIPT_TEAM, []) if script_team else []
    script_names = {member for member, _role in MOVIE_SCRIPT_CREW}
    for name, team in registry.items():
        if name in (MOVIE_SCRIPT_TEAM, "movie", "securitypro"):
            continue
        jobs = team_jobs(team, live_by_root)
        cards = live_team_cards.get(name, [])
        busy = {j["member"] for j in jobs if j["member"]}
        if any(c["state"] == "working" for c in cards):
            busy |= {"Bigkiji", "Pi"}
        members = [{"name": member, "role": role, "live": member in busy, "parent": TEAM_PARENT.get(member)} for member, role in TEAM_CREW]
        for profile, role in (team.get("profiles") or {}).items():
            members.append({"name": profile.capitalize(), "role": role, "live": False, "parent": "Claude Code"})
        roles = role_labels(team)
        out.append({"id": name, "name": TEAM_SHORT.get(name, team.get("label", name)), "label": team.get("label", name),
                    "live": bool(jobs) or any(c["state"] == "working" for c in cards), "members": members,
                    "specialists": roles[:16], "work": [{"title": j["title"], "member": j["member"]} for j in jobs][:5] + cards[:5],
                    # Owner 2026-10-01: every group takes direct instructions, not only MoviePro.
                    # Must match ROUTER_DIRECT / directTarget in server.mjs.
                    "direct": ["MiMo", "Claude Code", "Bigkiji"] + [p.capitalize() for p in (team.get("profiles") or {})]})
    # MoviePro is the film unit (ComfyUI/MovieProduction/AGENTS.md) plus the script-fix lane. It
    # runs through the movie board + movie-pro/gpu-job, not through the Router team lane.
    movie_db = os.path.join(home, "kanban", "boards", "movie", "kanban.db")
    movie_cards, movie_busy = [], set()
    conn = connect(movie_db) if os.path.exists(movie_db) else None
    if conn is not None:
        try:
            for title, status, assignee in conn.execute("select title, status, assignee from tasks where status in ('running','ready','blocked','todo') order by status = 'running' desc, created_at desc limit 5"):
                movie_cards.append({"title": (title or "")[:120], "state": KANBAN_OUTCOME.get(status, status),
                                    "member": MOVIE_PROFILE.get(assignee or "", None)})
                if status == "running":
                    movie_busy.add(MOVIE_PROFILE.get(assignee or "", assignee or ""))
        except sqlite3.Error:
            pass
    # Live processes count even when their card is only `ready` (see movie_activity).
    for job in reversed(movie_activity()):
        member = "Auto QA" if job["member"] == "Vision" else job["member"]
        movie_busy.add(member)
        movie_cards.insert(0, {"title": job["title"], "state": "working", "member": member})
    # A script-lane job belongs to the lane's own members only. Pi / Bigkiji / Claude Code also
    # run there, but they are not on this card, so they must not light it up.
    script_busy = {job["member"] for job in script_jobs if job["member"] in script_names}
    # A running lane card makes the card live without naming a member: the hint says which team lane
    # took the card, not who inside it, so no member badge is invented here.
    script_live = any(card["state"] == "working" for card in script_cards)
    members = [{"name": member, "role": role, "live": member in movie_busy, "parent": MOVIE_PARENT.get(member)} for member, role in MOVIE_CREW]
    if script_team:  # the lane exists only while the Router config keeps it
        members += [{"name": member, "role": role, "live": member in script_busy, "parent": MOVIE_PARENT.get(member)} for member, role in MOVIE_SCRIPT_CREW]
    out.append({"id": "movie", "name": "MoviePro", "label": "Lesson videos, scripts and GPU",
                "live": bool(movie_busy) or bool(script_busy) or script_live,
                "members": members,
                # The film unit's own six department skills plus the script lane's role files, read from
                # the Router registry like every other team. Before this the lane's roles were emitted
                # nowhere (its card was folded into this one) and the merged card quietly showed less
                # than the two cards it replaced. `dict.fromkeys` keeps registry order and drops a name
                # both sides list; `[:16]` is the same ceiling every other team gets.
                "specialists": list(dict.fromkeys([*MOVIE_SKILLS, *(role_labels(script_team) if script_team else [])]))[:16],
                "work": ([{"title": j["title"], "state": "working", "member": j["member"]} for j in script_jobs]
                         + script_cards + movie_cards)[:6],
                "board": "movie" if conn is not None else None,
                # MiMo reaches the same Router team lane as before (directTarget maps the MoviePro
                # card's MiMo to the `movie-pro` lane), so folding the cards in loses no route.
                "direct": list(dict.fromkeys([*MOVIE_DIRECT, *(MOVIE_SCRIPT_DIRECT if script_team else [])]))})
    out.append(blog_team(home))
    out.append(security_team(home))
    for team in out:
        reviewed_structure(team)
    models = member_models(home, router_config)
    for team in out:
        for member in team["members"]:
            model = models.get(member["name"])
            if model:
                member["model"] = model
        if team.get("id") in REVIEWED_TEAM_IDS and os.path.isfile(os.path.join(home, "state", "team-lane", "repair-hold.json")):
            team["workflow_note"] = "Automatic worker execution is held pending verification. " + team.get("workflow_note", "")
        if team.get("id") == "blog":
            team["workflow_note"] = "CreativeProTop-Momo owns drafts and publication approval. Universal Pi support and Router dispatch are not yet verified for this native profile path."
    print(json.dumps({"teams": out, "models": models}, ensure_ascii=False))


def blog_team(home):
    """CreativePro: the `creativepro` profile's Kanban cards on any board plus the SNS approval
    queue (read-only). Cards filed before the 2026-10-17 rename still carry the old `blogpro`
    assignee, so the query reads both ids rather than silently hiding that older work."""
    cards, busy = [], set()
    for path in glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db")):
        conn = connect(path)
        if conn is None:
            continue
        try:
            for title, status, assignee in conn.execute("select title, status, assignee from tasks where assignee in ('creativepro', 'blogpro') and status in ('running','ready','blocked','todo') order by created_at desc limit 5"):
                cards.append({"title": (title or "")[:120], "state": KANBAN_OUTCOME.get(status, status)})
                if status == "running":
                    busy.add(CREATIVE_PROFILE.get(assignee, assignee))
        except sqlite3.Error:
            pass
    try:
        waiting = sorted(name for name in os.listdir(CREATIVE_QUEUE) if name.endswith(".md"))
    except OSError:
        waiting = []
    if waiting:
        cards.append({"title": f"{len(waiting)} post(s) in the SNS queue waiting for your approval", "state": "waiting"})
    return {"id": "blog", "name": "CreativePro", "label": "Blogs, SNS, AI influencer (publication needs Yuma)", "live": bool(busy),
            "members": [{"name": member, "role": role, "live": member in busy, "parent": None if member == "CreativeProTop-Momo" else "CreativeProTop-Momo"} for member, role in CREATIVE_CREW],
            "specialists": CREATIVE_SKILLS, "work": cards[:6], "board": None, "direct": ["CreativeProTop-Momo"]}


def security_team(home):
    """Existing native oversight department, not a Router lane or activation request."""
    profile_present = os.path.isdir(os.path.join(home, "profiles", "securitypro"))
    db = os.path.join(home, "kanban", "boards", "securitypro", "kanban.db")
    conn = connect(db) if os.path.isfile(db) else None
    board_present = conn is not None
    work = []
    if conn is not None:
        try:
            rows = conn.execute("select title, status from tasks where status in ('running','ready','blocked','todo','review','scheduled') order by created_at desc limit 6")
            work = [{"title": str(title or "")[:120], "state": KANBAN_OUTCOME.get(status, status)} for title, status in rows]
        except sqlite3.Error:
            board_present = False
        finally:
            conn.close()
    evidence = profile_model_evidence(home, ["securitypro"])["securitypro"] if profile_present else {}
    configured = evidence.get("configured")
    observed = evidence.get("observed")
    inference = "observed_session" if observed else "configured_not_verified" if configured else "unbound"
    return {"id": "securitypro", "name": "SecurityPro", "label": "Security oversight (execution connection unverified)",
            "live": bool(observed), "members": [{"name": "SecurityPro", "role": "Security oversight lead; registration is not execution admission", "parent": None, "live": bool(observed), **({"model": observed} if observed else {})}],
            "specialists": ["securitypro-operations"], "work": work, "board": "securitypro" if board_present else None,
            "direct": [], "registration": {"profilePresent": profile_present, "boardPresent": board_present, "inference": inference, "configuredModel": configured, "observedModel": observed, "routerAdmission": "unverified", "independentSecurityQA": "unverified"},
            "workflow": "Bigkiji → SecurityPro triage → existing owning-team implementation → Pi checks → independent qualified review → Bigkiji verification and delivery",
            "workflow_note": "Registered oversight department. No new worker or direct dispatch is enabled. Missing/unbound inference and pending SEC findings are not a security PASS."}


def profile_model_evidence(home, profiles):
    out = {}
    for profile in profiles:
        base = home if profile == "default" else os.path.join(home, "profiles", profile)
        configured = _profile_model(home, None if profile == "default" else profile)
        observed, at = None, None
        db = os.path.join(base, "state.db")
        if os.path.isfile(db):
            try:
                conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=0.3)
                row = conn.execute("select model, coalesce(last_activity_at, started_at) from sessions where ended_at is null and coalesce(last_activity_at, started_at) > ? and model is not null order by coalesce(last_activity_at, started_at) desc limit 1", (time.time() - SESSION_LIVE_SECONDS,)).fetchone()
                if row:
                    observed, at = row
                conn.close()
            except sqlite3.Error:
                pass
        out[profile] = {"configured": configured, "source": "config.yaml:model.default" if configured else None,
                        "observed": observed, "observedAt": at, "observedSource": "state.db:sessions.model" if observed else None,
                        "association": "Session model only; card model association unrecorded"}
    return out


def cards(home, days):
    """Every open card and every card done in the last `days` days, on every board, plus the
    Hermes profile names (read-only). office.mjs places them in the office rooms."""
    since = time.time() - days * 86400
    boards = [(p, os.path.basename(os.path.dirname(p))) for p in sorted(glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db")))]
    legacy = os.path.join(home, "kanban.db")
    if os.path.exists(legacy):
        boards.append((legacy, "default"))
    out, read = [], []
    for path, slug in boards:
        conn = connect(path)
        if conn is None:
            continue
        try:
            rows = conn.execute(
                "select id, title, status, assignee, body, result, created_at, started_at, completed_at from tasks"
                " where status != 'archived' and (status != 'done' or coalesce(completed_at, created_at) >= ?)", (since,)).fetchall()
            for task_id, title, status, assignee, body, result, created, started, completed in rows:
                team = next((line.split(":", 1)[1].strip() for line in (body or "").splitlines() if line.lower().startswith("team:")), None)
                reason, member = None, None
                if assignee == "team":
                    # The team-lane member working the card now is its last commenter (as in flow()).
                    row = conn.execute("select payload from task_events where task_id = ? and kind = 'commented' order by created_at desc, id desc limit 1", (task_id,)).fetchone()
                    try:
                        member = str((json.loads(row[0] or "{}") or {}).get("author") or "").strip().lower() or None if row else None
                    except ValueError:
                        pass
                if status == "blocked":
                    row = conn.execute("select payload from task_events where task_id = ? and kind = 'blocked' order by created_at desc, id desc limit 1", (task_id,)).fetchone()
                    try:
                        payload = json.loads(row[0] or "{}") if row else {}
                        reason = str(payload.get("reason") or "").strip() or None
                    except ValueError:
                        pass
                out.append({"id": task_id, "board": slug, "title": (title or task_id), "status": status,
                            "assignee": (assignee or "").strip().lower() or None, "team": team, "member": member,
                            "result": (result or "").strip() or None, "reason": reason,
                            "createdAt": created, "startedAt": started, "completedAt": completed})
            read.append(slug)
        except sqlite3.Error:
            pass
        conn.close()
    try:
        profiles = sorted(name for name in os.listdir(os.path.join(home, "profiles")) if os.path.isdir(os.path.join(home, "profiles", name)))
    except OSError:
        profiles = []
    print(json.dumps({"cards": out, "boards": read, "profiles": ["default"] + profiles, "profileModels": profile_model_evidence(home, ["default"] + profiles)}, ensure_ascii=False))


def main():
    if len(sys.argv) > 2 and sys.argv[2] == "cards":
        return cards(os.path.expanduser(sys.argv[1]), int(sys.argv[3]) if len(sys.argv) > 3 else 7)
    if len(sys.argv) > 2 and sys.argv[2] == "flow":
        since = int(float(sys.argv[3])) if len(sys.argv) > 3 else 0
        return flow(os.path.expanduser(sys.argv[1]), since, os.path.expanduser(sys.argv[4]) if len(sys.argv) > 4 else os.path.expanduser("~/Documents/AI/jobs"))
    if len(sys.argv) > 2 and sys.argv[2] == "teams":
        return teams(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[3]) if len(sys.argv) > 3 else os.path.expanduser("~/Documents/AI/router/config"),
                     os.path.expanduser(sys.argv[4]) if len(sys.argv) > 4 else os.path.expanduser("~/Documents/AI/jobs"))
    if len(sys.argv) > 2 and sys.argv[2] == "live":
        return live(os.path.expanduser(sys.argv[1]))
    home = os.path.expanduser(sys.argv[1])
    since = int(float(sys.argv[2])) if len(sys.argv) > 2 else 0
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    boards = []
    for path in sorted(glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db"))):
        directory = os.path.dirname(path)
        slug = os.path.basename(directory)
        boards.append((path, slug, board_name(directory, slug)))
    legacy = os.path.join(home, "kanban.db")
    if os.path.exists(legacy):
        boards.append((legacy, "default", "Default board"))
    items = []
    for path, slug, name in boards:
        try:
            items.extend(read_board(path, slug, name, since, max(limit * 10, 300)))
        except sqlite3.Error:
            continue
    items.sort(key=lambda item: (item["at"], item["id"]), reverse=True)
    # One busy agent (usually the orchestrator's board syncs) must not push every
    # other agent out of the window: keep the newest `limit` overall, plus each
    # author's newest few so every voice stays visible.
    kept, per_author = {}, {}
    for item in items:
        count = per_author.get(item["author"], 0)
        if len(kept) < limit or count < 5:
            kept[item["id"]] = item
            per_author[item["author"]] = count + 1
    result = sorted(kept.values(), key=lambda item: (item["at"], item["id"]), reverse=True)
    print(json.dumps({"items": result, "boards": len(boards)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
