#!/bin/zsh
# Ship BrainBook end-to-end, with NO silent gaps between "I edited source" and
# "the owner can see it in the running app".
#
# Owner 2026-10-11, after a source fix sat unbuilt/undeployed for 5+ hours while reported as
# "done": "今後このようなことがないように、タスクは確実に終わらせてください。途中で投げ出すことは
# 絶対にしないでください。コードを書いて確実にしてください" (make sure tasks are always actually
# finished; never abandon mid-way; write code that makes this certain — not a promise).
#
# This script is the ONLY way BrainBook work should ever be called "done". It does every step
# in one atomic command and FAILS LOUDLY (non-zero exit, explicit reason) the moment any one of
# them is skipped, broken, or doesn't actually land — so there is no "I ran tsc, looked fine,
# forgot the rest" possibility. `npm run build` / `macos/build-app.sh` alone are NOT a finish line
# for owner-visible work; this script is.
#
# Steps, each one hard-required:
#   1. tsc --noEmit        — type errors stop everything before a single byte is built.
#   2. npm run build       — the web bundle (dist/).
#   3. macos/build-app.sh  — native shell, bundled Node, sign, install to /Applications.
#   4. HASH VERIFY         — the installed .app's dist/assets are byte-identical (sha256) to the
#                             dist/ this script just built. A stale install is a FAIL, not a warning.
#   5. RESTART             — quit the running BrainBook.app (if any) and relaunch the installed one.
#   6. HEALTH CHECK        — poll the real HTTP server (default :4183) until it answers 200, with
#                             a hard timeout. No response = FAIL, not "probably fine".
#
# Usage: macos/ship.sh
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
ROOT=$PWD
PORT="${BRAINBOOK_PORT:-4183}"
FAIL() { echo "❌ SHIP FAILED: $1" >&2; exit 1; }

echo "── 1/6 type check ──"
npx tsc --noEmit -p . || FAIL "tsc reported type errors — nothing was built or deployed"

echo "── 2/6 + 3/6 build + install (macos/build-app.sh runs npm run build itself — do not build twice, two separate builds of identical source are not guaranteed byte-identical and that previously produced a false hash mismatch here) ──"
bash "$ROOT/macos/build-app.sh" || FAIL "build-app.sh did not complete"

echo "── 4/6 verify the installed bundle matches what was just built (no stale install) ──"
# Compare content hashes only (not the absolute paths, which legitimately differ between
# $ROOT/dist and the installed .app) — same filenames, same per-file sha256, sorted.
BUILT_HASH=$(cd "$ROOT/dist/assets" && find . -type f \( -name '*.css' -o -name '*.js' \) -exec shasum -a 256 {} \; | awk '{print $1, $2}' | sort | shasum -a 256 | awk '{print $1}')
INSTALLED_HASH=$(cd /Applications/BrainBook.app/Contents/Resources/app/dist/assets && find . -type f \( -name '*.css' -o -name '*.js' \) -exec shasum -a 256 {} \; | awk '{print $1, $2}' | sort | shasum -a 256 | awk '{print $1}')
[[ "$BUILT_HASH" == "$INSTALLED_HASH" ]] || FAIL "installed /Applications/BrainBook.app dist/assets hash ($INSTALLED_HASH) != freshly built dist/assets hash ($BUILT_HASH) — the install step silently did not copy the new build"
echo "   OK — installed bundle hash matches the build just produced: $BUILT_HASH"

echo "── 5/6 restart the running app ──"
osascript -e 'tell application "BrainBook" to quit' 2>/dev/null || true
sleep 2
open -a /Applications/BrainBook.app
echo "   relaunched /Applications/BrainBook.app"

echo "── 6/6 health check (http://127.0.0.1:$PORT) ──"
OK=""
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/api/office" 2>/dev/null || echo "000")
  if [[ "$CODE" == "200" ]]; then OK=1; break; fi
  sleep 1
done
[[ -n "$OK" ]] || FAIL "server did not answer 200 on :$PORT within 15s after restart — app may not have started"
echo "   OK — server answered 200 after restart"

echo "✅ SHIPPED: built, installed, hash-verified, restarted, and confirmed live at :$PORT"
