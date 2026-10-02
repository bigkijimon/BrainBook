#!/usr/bin/env python3
"""Minimal, generic task router: given a task string, decide which worker handles it.

Usage:
    python3 route.py "fix the login bug"
    python3 route.py --json "this is a difficult architecture decision"

This is a *sample*, not a drop-in production router. It demonstrates the pattern used by a
real BrainBook deployment's Router (cost-tiered, deterministic keyword rules, explicit
fallbacks) without any company-specific paths, team names, or business rules.

Extend it by:
- adding more categories to config/routes.json
- adding real adapters (see adapters/free_worker.py, adapters/paid_worker.py) that actually
  shell out to your CLI agents
- optionally adding a semantic classifier in front of the keyword rules for ambiguous input
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORKERS = json.loads((HERE / "config" / "workers.json").read_text())
ROUTES = json.loads((HERE / "config" / "routes.json").read_text())

# Deterministic keyword rules. Keep this list short and specific; prefer false negatives
# (falls through to default_worker) over false positives that misroute cheap work to a
# paid worker.
CATEGORY_PATTERNS = {
    "difficult": [r"\bdifficult\b", r"\bexpert\b", r"\bescalat", r"\barchitecture decision\b"],
    "debug": [r"\bdebug\b", r"\breproduce\b", r"\bdiagnos"],
    "qa": [r"\bqa\b", r"\breview\b", r"\bverify\b"],
    "bug_fix": [r"\bfix\b", r"\bbug\b"],
    "ui_design": [r"\bui\b", r"\bdesign\b", r"\blayout\b"],
    "web": [r"\bweb\b", r"\bbrowser\b", r"\bsearch online\b"],
}


def classify(text: str) -> str:
    lowered = text.lower()
    for category, patterns in CATEGORY_PATTERNS.items():
        if any(re.search(p, lowered) for p in patterns):
            return category
    return "coding"  # default bucket


def pick_worker(text: str) -> dict:
    category = classify(text)
    worker_name = ROUTES["routes"].get(category, ROUTES["default_worker"])
    worker = WORKERS.get(worker_name)
    if not worker or not worker.get("enabled", True):
        for fallback_name in ROUTES["fallbacks"].get(worker_name, []):
            fallback = WORKERS.get(fallback_name)
            if fallback and fallback.get("enabled", True):
                return {"worker": fallback_name, "category": category, "reason": "fallback"}
        return {"worker": None, "category": category, "reason": "no_worker_available"}
    return {"worker": worker_name, "category": category, "reason": "matched_route"}


def main() -> int:
    args = sys.argv[1:]
    as_json = "--json" in args
    args = [a for a in args if a != "--json"]
    if not args:
        print("usage: route.py [--json] \"<task text>\"", file=sys.stderr)
        return 2
    result = pick_worker(" ".join(args))
    if as_json:
        print(json.dumps(result))
    else:
        print(f"worker={result['worker']} category={result['category']} reason={result['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
