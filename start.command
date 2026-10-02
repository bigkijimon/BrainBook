#!/bin/zsh
# Developer shortcut: run BrainBook from source with hot reload.
set -e
cd -- "$(dirname -- "$0")"
[[ -d node_modules ]] || npm install
echo ""
echo "BrainBook (dev) is starting at http://127.0.0.1:4173"
echo "Keep this Terminal window open. Press Control-C to stop."
echo ""
npm run dev
