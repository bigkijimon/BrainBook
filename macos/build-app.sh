#!/bin/zsh
# Build BrainBook.app (arm64) and install it into /Applications.
# The app bundles its own Node runtime, server.mjs and the built UI, so it runs without a Terminal.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
ROOT=$PWD
OUT="$ROOT/macos/build"
APP="$OUT/BrainBook.app"
PY=${ASTER_ICON_PYTHON:-python3}  # needs Pillow for the icon; prebuilt icon is used when missing
# The app ships one Node binary, so it must be self-contained (the official nodejs.org build).
# Homebrew's node links @rpath/libnode.*.dylib and fails to start inside the bundle.
NODE=""
for candidate in "${BRAINBOOK_NODE:-}" /usr/local/bin/node "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  if ! otool -L "$candidate" | grep -q "libnode"; then NODE="$candidate"; break; fi
done
if [[ -z "$NODE" ]]; then
  echo "ERROR: need a self-contained Node.js (install the macOS package from nodejs.org, or set BRAINBOOK_NODE=/path/to/node)." >&2
  exit 1
fi
echo "Bundling Node: $NODE ($("$NODE" -v))"

npm run build
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app/data"

# Native shell (Apple silicon only)
swiftc -O -target arm64-apple-macos13 -framework Cocoa -framework WebKit \
  "$ROOT/macos/DashboardConnection.swift" "$ROOT/macos/main.swift" -o "$APP/Contents/MacOS/BrainBook"

# Node runtime: keep only the arm64 slice
lipo "$NODE" -thin arm64 -output "$APP/Contents/Resources/node" 2>/dev/null || cp "$NODE" "$APP/Contents/Resources/node"
chmod +x "$APP/Contents/Resources/node"
# Refuse to ship a runtime that cannot start on its own.
"$APP/Contents/Resources/node" -e "process.exit(0)" || { echo "ERROR: bundled node does not start" >&2; exit 1; }

# Server + UI (runtime deps: ws, qrcode — bundled from node_modules)
# Every top-level server module is copied, so a new *.mjs can never be left out of the app
# (2026-09-30: capture.mjs was missing and the installed server failed to start).
cp "$ROOT"/*.mjs "$ROOT"/office-map.json "$ROOT/pty-host.py" "$ROOT/agent-feed.py" "$ROOT/package.json" "$APP/Contents/Resources/app/"
cp -R "$ROOT/dist" "$APP/Contents/Resources/app/dist"
( cd "$APP/Contents/Resources/app" && npm install --omit=dev --no-audit --no-fund --ignore-scripts ws qrcode >/dev/null )

# Icon
ICONSET="$OUT/BrainBook.iconset"; rm -rf "$ICONSET"; mkdir -p "$ICONSET"
"$PY" "$ROOT/macos/make_icon.py" "$OUT/icon-1024.png" 2>/dev/null || cp "$ROOT/macos/icon-1024.png" "$OUT/icon-1024.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$OUT/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$OUT/icon-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
cp "$ROOT/macos/loading.css" "$ROOT/macos/loading-svg.html" "$APP/Contents/Resources/"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/BrainBook.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>BrainBook</string>
  <key>CFBundleDisplayName</key><string>BrainBook</string>
  <key>CFBundleIdentifier</key><string>com.bku.brainbook</string>
  <key>CFBundleExecutable</key><string>BrainBook</string>
  <key>CFBundleIconFile</key><string>BrainBook</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.2.0</string>
  <key>CFBundleVersion</key><string>3</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSArchitecturePriority</key><array><string>arm64</string></array>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>BrainBook listens only while its mic button is on, to turn your spoken instruction into text you check before sending.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>BrainBook turns your spoken instruction into text you check before sending.</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST

# Ad-hoc sign (inner binaries first) so Gatekeeper accepts a locally built app
# Signing identity: macOS privacy permissions (e.g. access to ~/Documents) are tied to the app's
# signature. Ad-hoc signing ("-") changes with every build, so each rebuild asks again.
# To keep one identity, put a Keychain code-signing identity name in macos/.sign-identity
# (git-ignored) or BRAINBOOK_SIGN_IDENTITY. Release zips use ad-hoc unless you set one.
SIGN="${BRAINBOOK_SIGN_IDENTITY:-}"
[[ -z "$SIGN" && -f "$ROOT/macos/.sign-identity" && "${1:-}" != "--package" ]] && SIGN=$(head -1 "$ROOT/macos/.sign-identity")
SIGN="${SIGN:--}"
echo "Signing with: $SIGN"
codesign --force -s "$SIGN" "$APP/Contents/Resources/node"
codesign --force -s "$SIGN" "$APP"
codesign --verify --deep --strict "$APP"

# --package: make a zip for GitHub Releases instead of installing (used for sharing with friends).
if [[ "${1:-}" == "--package" ]]; then
  VERSION=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$APP/Contents/Info.plist")
  ZIP="$OUT/BrainBook-$VERSION-arm64.zip"
  rm -f "$ZIP"
  ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
  shasum -a 256 "$ZIP" | tee "$ZIP.sha256"
  echo "PACKAGED $ZIP"
  exit 0
fi

rm -rf /Applications/BrainBook.app
ditto "$APP" /Applications/BrainBook.app
xattr -dr com.apple.quarantine /Applications/BrainBook.app 2>/dev/null || true
rm -rf /Applications/Aster.app  # previous name
echo "INSTALLED /Applications/BrainBook.app"
