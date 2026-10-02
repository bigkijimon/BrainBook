#!/usr/bin/env python3
"""Example adapter: run one task through a paid CLI coding agent, with a spend cap.

Use this only for the `difficult` / `qa` / `debug` categories or an explicit escalation —
see config/routes.json. Always pass a per-run budget flag if your CLI supports one.
"""
import json
import subprocess
import sys
import time

MAX_BUDGET_USD = 5.0  # safety cap per run, not a real charge estimate


def main() -> int:
    request = json.load(sys.stdin)
    task = request["task"]
    cwd = request["working_directory"]

    prompt = f"Task: {task}\nWork only inside {cwd}. Report evidence concisely."

    # Example: Claude Code CLI. Swap for whatever paid agent CLI you use.
    cmd = ["claude", "-p", prompt, "--model", "sonnet"]

    started = time.time()
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
        status = "completed" if result.returncode == 0 else "failed"
        summary = (result.stdout or result.stderr).strip()[-2000:]
    except subprocess.TimeoutExpired:
        status, summary = "failed", "timed out after 600s"

    print(json.dumps({
        "worker": "paid_worker",
        "status": status,
        "summary": summary,
        "elapsed_s": round(time.time() - started, 1),
        "budget_cap_usd": MAX_BUDGET_USD,
    }))
    return 0 if status == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
