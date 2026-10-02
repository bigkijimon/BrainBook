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
        f"""select e.id, e.task_id, e.kind, e.payload, e.created_at, t.title, t.assignee, t.result
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
            "text": text[:600],
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
    ("/EnglishContentOS", "lesson videos (movie-pro)"),
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


# Film Group work that runs as local processes, not as a running Kanban card
# (owner 2026-09-30: "MoviePro only ever shows Steve and ComfyUI; are QA and the
# other agents synced?"). Measured the same day: during a lesson-video run the
# chain spends about 40% of its time in cut QA (Whisper + Vision, 7 min per cut),
# which BrainBook never showed. Each rule maps a process to the member that owns
# that work; the process list is the truth, like gpu_work() below.
MOVIE_PROCESSES = [
    # (member, markers, what it is)
    ("ComfyUI", ("gpu_job_supervisor", "bku-gpu-run", "face_turnaround.py", "hero_portrait.py", "master_sheet.py"), "gpu"),
    ("Auto QA", ("cut_qa.py", "keyframe_qa.py", "unit_gate.py", "whisper-cli"), "qa"),
    ("Vision", ("llama-mtmd-cli", "/bin/ai-see"), "vision"),
    ("Steve", ("campaign28_chain.sh", "campaign28_generate.py", "charref_finish.sh"), "chain"),
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
    return "movie-pro: lesson video chain" + (f" ({where})" if where else "")


def movie_activity():
    """Live Film Group work, one entry per member (read-only process scan)."""
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
              "opencode": "OpenCode", "pi": "Pi",
              "stevenspielberg": "Steve", "kuro": "Kuro", "mame": "Shimajiro", "ame": "Ame", "maru": "Maru", "sora": "Sora"}
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
            giver = parent_of.get(tid) or created_by
            team_short = None
            to_name = who(assignee)
            if assignee == "team":
                # A team-lane card carries `team: <name>` in its body; the member
                # actually working is whoever last commented on it.
                hint = next((line.split(":", 1)[1].strip() for line in (body or "").splitlines() if line.lower().startswith("team:")), None)
                team_short = TEAM_SHORT.get(hint, hint)
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
                to_name = who(member) if member else "Bigkiji"
            handoff = {
                "id": f"{slug}:{tid}", "source": "kanban", "board": slug, "boardName": board_name(directory, slug),
                "from": who(giver), "to": to_name, "title": (title or "")[:160], "state": KANBAN_OUTCOME.get(status, status),
                "active": status == "running", "at": completed_at or started_at or created_at,
                "note": ((summary or "")[:220] if status in ("done", "blocked") else (f"attempt {runs}" if runs and runs > 1 else "")),
                "outcome": outcome,
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
                "from": who(job.get("source") or "hermes"), "to": steps[-1]["to"], "title": str(job.get("objective") or job.get("task") or "")[:160],
                "state": steps[-1]["state"], "active": status == "running", "at": int(os.path.getmtime(file)),
                "note": ("; ".join(str(f) for f in failures) or (job.get("reason") or ""))[:200], "steps": steps,
            })
    # bin/submit writes a pre-dispatch receipt that keeps status "running" after the worker's own
    # receipt finishes; drop that leftover when a finished receipt for the same objective exists.
    finished = {(item["from"], item["title"]) for item in handoffs if item["source"] == "router" and item["state"] not in ("left over", "working")}
    handoffs = [item for item in handoffs if not (item["source"] == "router" and item["state"] == "left over" and (item["from"], item["title"]) in finished)]
    # Live Film Group work is team work even when its card is still `ready` (see movie_activity).
    live_members = {job["member"] for job in movie_activity()}
    giver = {"Steve": "Bigkiji", "ComfyUI": "Steve", "Auto QA": "Steve", "Vision": "Auto QA" if "Auto QA" in live_members else "Steve"}
    for job in movie_activity():
        queue = comfy_queue() if job["gpu"] else None
        note = (f"ComfyUI :{queue['port']} · {queue['running']} running, {queue['pending']} waiting" if queue else "GPU lease active") if job["gpu"] else "local process"
        handoffs.append({"id": job["id"], "source": "kanban", "board": "movie", "boardName": "MoviePro", "from": giver.get(job["member"], "Steve"),
                         "to": job["member"], "title": job["title"], "state": "working", "active": True, "at": job["startedAt"],
                         "note": note, "steps": [{"to": job["member"], "state": "working"}], "team": "movie"})
    # Live Hermes sessions (terminal, Telegram, Dashboard, profile agents): Yuma → agent.
    for job in session_activity(home):
        handoffs.append({"id": job["id"], "source": "session", "board": "session", "boardName": job["boardName"], "from": "You",
                         "to": job["assignee"], "title": job["title"], "state": "working", "active": True, "at": job["startedAt"],
                         "note": "", "steps": [{"to": job["assignee"], "state": "working"}], "team": None})
    seen, out = set(), []
    for item in sorted(handoffs, key=lambda item: (not item["active"], -(item["at"] or 0))):
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        out.append(item)
    agents = {}
    for item in out:
        for name in [item["from"], item["to"], *[step["to"] for step in item.get("steps", [])]]:
            if name == "You":   # the owner as sender of a live Hermes session, not an agent
                continue
            agents.setdefault(name, {"name": name, "active": False, "count": 0})
            agents[name]["count"] += 1
        if item["active"]:
            agents[item["to"]]["active"] = True
    print(json.dumps({"handoffs": out[:40], "agents": sorted(agents.values(), key=lambda a: (not a["active"], -a["count"]))}, ensure_ascii=False))


# Short team names for the left menu (owner 2026-09-29: "MoviePro, AppPro, ClassPro...").
TEAM_SHORT = {"app-dev": "AppPro", "accountpro": "AccountPro", "hs-school-ops": "ClassPro",
              "investment": "InvestPro", "igataya-web": "RentPro", "marketing": "MarketPro", "movie": "MoviePro"}
# Every team has the same crew; the role says what each one does there.
TEAM_CREW = [("Bigkiji", "routes and reports"), ("Pi", "support: brief + checks"), ("MiMo", "builder"),
             ("Space Bunny", "UI"), ("Claude Code", "debug first (reproduce + root cause), then QA; difficult"), ("Jev", "decision support")]
# Hierarchy inside a Router team, as bin/team-run runs it: Bigkiji routes; Pi briefs and
# checks; MiMo / Space Bunny build; Claude Code runs QA and debug; Jev advises Bigkiji.
TEAM_PARENT = {"Bigkiji": None, "Pi": "Bigkiji", "Jev": "Bigkiji", "MiMo": "Pi", "Space Bunny": "Pi", "Claude Code": "Bigkiji"}
# Film Group: Steve directs; the scenario/audio departments run on Steve's profile; Auto QA
# drives the Vision check; ComfyUI is operated by Maru's GPU lane.
MOVIE_PARENT = {"Steve": None, "HideoKojima": "Steve", "RyūichiSakamoto": "Steve", "Kuro": "Steve", "Shimajiro": "Steve",
                "Ame": "Shimajiro", "Maru": "Steve", "Auto QA": "Steve", "ComfyUI": "Maru"}
ROUTER_TO_MEMBER = {"mimo": "MiMo", "claude": "Claude Code", "hermes": "Bigkiji", "pi": "Pi"}
# Film Group leadership (ComfyUI/MovieProduction/AGENTS.md) and its department skills.
MOVIE_CREW = [("Steve", "production director"), ("HideoKojima", "scenario and world"),
              ("RyūichiSakamoto", "audio"), ("Kuro", "independent review"), ("Shimajiro", "education brief"),
              ("Ame", "education research"), ("Maru", "GPU operation"), ("Auto QA", "automatic QA: cut, keyframe, unit gate"),
              ("ComfyUI", "image and video generation (GPU)")]
# Members the owner can instruct directly from BrainBook (server.mjs owns the
# name -> Hermes profile mapping). HideoKojima and RyūichiSakamoto are
# departments that run under Steve's profile, so they are reached through Steve.
MOVIE_DIRECT = ["Steve", "Kuro", "Ame", "Shimajiro", "Maru"]
MOVIE_PROFILE = {"stevenspielberg": "Steve", "kuro": "Kuro", "mame": "Shimajiro", "ame": "Ame", "maru": "Maru"}
# BlogPro (owner 2026-09-29): blogs, SNS and AI influencer. Lead is the `sora` profile.
# Publication always waits for Yuma, so this group is shown but never auto-dispatched.
BLOG_CREW = [("Sora", "lead: content and SNS"), ("Coco", "AI influencer"), ("Blog QA", "H&S blog 95-point gate"),
             ("Tech Blog QA", "tech blog 95-point gate")]
BLOG_PROFILE = {"sora": "Sora"}
BLOG_SKILLS = ["blog pipeline", "sns studio", "influencer studio", "blog qa", "tech blog qa"]
BLOG_QUEUE = os.path.expanduser("~/Documents/AI/AgentsDB/Admin/SNSStudioSora/_queue")
MOVIE_SKILLS = ["film scenario", "film preproduction", "film identity", "movie character reference",
                "movie video generation", "film review"]


# Which model each member really runs (owner 2026-09-30: "write the LLM under each name").
# Read live from the owning configs so the label follows a config change: Hermes profile
# config.yaml (model.default), Router config/workers.yaml, Router adapters/mimo (UI lane).
# Members with no config of their own (tools, departments) name the files that prove it.
PROFILE_OF = {"Bigkiji": None, "Steve": "stevenspielberg", "Kuro": "kuro", "Ame": "ame", "Shimajiro": "mame",
              "Maru": "maru", "Sora": "sora", "Tora": "tora", "Hana": "hana"}


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
            return line.split(":", 1)[1].strip().strip("'\"")
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
    out["MiMo"] = _pretty(mimo.get("model")) + (f" (backup {_pretty(mimo.get('backup_model'))})" if mimo.get("backup_model") else "")
    ui = None
    try:
        with open(os.path.join(os.path.dirname(router_config), "adapters", "mimo"), encoding="utf-8") as handle:
            ui = next((line.split('"')[3] for line in handle if '"ui": (' in line), None)
    except (OSError, IndexError):
        pass
    out["Space Bunny"] = _pretty(ui) or "Space Bunny (OpenCode)"
    out["Claude Code"] = "Claude Sonnet (high) · Opus for difficult"   # config/routes.yaml claude_lanes
    out["Vision"] = _pretty((workers.get("vision") or {}).get("model"))
    out["Qwen (local)"] = "Qwen3.8 27B · local"                        # config/resources.yaml qwen_model
    out["Router"] = "vLLM Semantic Router + rules"                      # workers.yaml semantic_router
    out["Pi"] = "No LLM (scripts only)"                                 # bin/pi-support: "no model used"
    out["Jev"] = "jev-1.13.0 (typesafe.ai)"                             # adapters/typesafe-jev
    out["Auto QA"] = "Whisper large-v3-turbo + Qwen2.5-VL 7B"           # media/scripts/cut_qa.py
    out["ComfyUI"] = "Qwen-Image-Edit 2511 + LTX-2.5 22B"               # gen_keyframe.py, ltx25-golden.json
    out["HideoKojima"] = out["RyūichiSakamoto"] = out.get("Steve")      # departments on Steve's profile
    for name in ("Coco", "Blog QA", "Tech Blog QA"):                    # skills run by the sora profile
        out[name] = out.get("Sora")
    return {name: model for name, model in out.items() if model}


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
    for name, team in registry.items():
        roots = {os.path.realpath(team["root"])} | {os.path.realpath(r) for r in (team.get("roots") or {}).values()}
        jobs = [j for r in roots for j in live_by_root.get(r, [])]
        cards = live_team_cards.get(name, [])
        busy = {j["member"] for j in jobs if j["member"]}
        if any(c["state"] == "working" for c in cards):
            busy |= {"Bigkiji", "Pi"}
        members = [{"name": member, "role": role, "live": member in busy, "parent": TEAM_PARENT.get(member)} for member, role in TEAM_CREW]
        for profile, role in (team.get("profiles") or {}).items():
            members.append({"name": profile.capitalize(), "role": role, "live": False, "parent": "Claude Code"})
        roles = []
        for rel in team.get("roles", []):
            base = rel if rel.startswith("/") else os.path.join(team["root"], rel)
            roles.append(os.path.splitext(os.path.basename(base))[0].split("-", 1)[-1].replace("-", " "))
        out.append({"id": name, "name": TEAM_SHORT.get(name, team.get("label", name)), "label": team.get("label", name),
                    "live": bool(jobs) or any(c["state"] == "working" for c in cards), "members": members,
                    "specialists": roles[:16], "work": [{"title": j["title"], "member": j["member"]} for j in jobs][:5] + cards[:5],
                    # Owner 2026-10-01: every group takes direct instructions, not only MoviePro.
                    # Must match ROUTER_DIRECT / directTarget in server.mjs.
                    "direct": ["MiMo", "Claude Code", "Bigkiji"] + [p.capitalize() for p in (team.get("profiles") or {})]})
    # MoviePro is the Film Group (ComfyUI/MovieProduction/AGENTS.md). It runs through the
    # movie board + movie-pro/gpu-job, not the Router team lane.
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
    out.append({"id": "movie", "name": "MoviePro", "label": "Film Group (movie-pro, GPU)",
                "live": bool(movie_busy),
                "members": [{"name": member, "role": role, "live": member in movie_busy, "parent": MOVIE_PARENT.get(member)} for member, role in MOVIE_CREW],
                "specialists": MOVIE_SKILLS, "work": movie_cards[:6], "board": "movie" if conn is not None else None,
                "direct": [name for name in MOVIE_DIRECT]})
    out.append(blog_team(home))
    models = member_models(home, router_config)
    for team in out:
        for member in team["members"]:
            member["model"] = models.get(member["name"])
    print(json.dumps({"teams": out, "models": models}, ensure_ascii=False))


def blog_team(home):
    """BlogPro: sora's Kanban cards on any board plus the SNS approval queue (read-only)."""
    cards, busy = [], set()
    for path in glob.glob(os.path.join(home, "kanban", "boards", "*", "kanban.db")):
        conn = connect(path)
        if conn is None:
            continue
        try:
            for title, status, assignee in conn.execute("select title, status, assignee from tasks where assignee = 'sora' and status in ('running','ready','blocked','todo') order by created_at desc limit 5"):
                cards.append({"title": (title or "")[:120], "state": KANBAN_OUTCOME.get(status, status)})
                if status == "running":
                    busy.add(BLOG_PROFILE.get(assignee, assignee))
        except sqlite3.Error:
            pass
    try:
        waiting = sorted(name for name in os.listdir(BLOG_QUEUE) if name.endswith(".md"))
    except OSError:
        waiting = []
    if waiting:
        cards.append({"title": f"{len(waiting)} post(s) in the SNS queue waiting for your approval", "state": "waiting"})
    return {"id": "blog", "name": "BlogPro", "label": "Blogs, SNS, AI influencer (publication needs Yuma)", "live": bool(busy),
            "members": [{"name": member, "role": role, "live": member in busy, "parent": None if member == "Sora" else "Sora"} for member, role in BLOG_CREW],
            "specialists": BLOG_SKILLS, "work": cards[:6], "board": None, "direct": ["Sora"]}


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
                        reason = str(payload.get("reason") or "").strip()[:300] or None
                    except ValueError:
                        pass
                out.append({"id": task_id, "board": slug, "title": (title or task_id)[:160], "status": status,
                            "assignee": (assignee or "").strip().lower() or None, "team": team, "member": member,
                            "result": ((result or "").strip().splitlines() or [""])[0][:200] or None, "reason": reason,
                            "createdAt": created, "startedAt": started, "completedAt": completed})
            read.append(slug)
        except sqlite3.Error:
            pass
        conn.close()
    try:
        profiles = sorted(name for name in os.listdir(os.path.join(home, "profiles")) if os.path.isdir(os.path.join(home, "profiles", name)))
    except OSError:
        profiles = []
    print(json.dumps({"cards": out, "boards": read, "profiles": ["default"] + profiles}, ensure_ascii=False))


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
