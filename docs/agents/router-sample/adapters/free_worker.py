#!/usr/bin/env python3
"""Example adapter: run one task through a free/local CLI coding agent.

Shows the shape (stdin JSON in, job-status JSON out) without any site-specific paths.
Replace the `cmd` list with whatever free coding CLI you use (OpenCode, a local agent CLI,
etc). Keep a timeout and never let a "read-only" request actually write files.
"""
import json
import subprocess
import sys
import time


def main() -> int:
    request = json.load(sys.stdin)
    task = request["task"]
    cwd = request["working_directory"]
    allow_write = bool(request.get("allow_write"))

    prompt = (
        f"Task: {task}\n"
        f"Work only inside {cwd}.\n"
        + ("You may modify files in this directory.\n" if allow_write
           else "Do NOT modify, create, or delete any file. Inspect and report only.\n")
    )

    # Example: OpenCode CLI, free tier. Swap for your own agent's invocation.
    cmd = ["opencode", "run", "--dir", cwd, "--model", "your-free-model-id", prompt]

    started = time.time()
    try:
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
        status = "completed" if result.returncode == 0 else "failed"
        summary = (result.stdout or result.stderr).strip()[-2000:]
    except subprocess.TimeoutExpired:
        status, summary = "failed", "timed out after 300s"

    print(json.dumps({
        "worker": "free_worker",
        "status": status,
        "summary": summary,
        "elapsed_s": round(time.time() - started, 1),
    }))
    return 0 if status == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
