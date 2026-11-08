#!/usr/bin/env bash
#
# Builds Diary.ipa for sideloading with Sideloadly or AltStore.
#
#   npm run build:ipa                 # uses .env.local as it is
#   npm run build:ipa -- --device-only  # no backend: no accounts, nothing synced
#
# Run on a Mac with Xcode. The .ipa is left UNSIGNED on purpose: whoever installs
# it signs it with their own Apple ID in Sideloadly or AltStore, which is the
# whole point — no paid developer account is needed, by you or by them.
#
# Output: build/ipa/Diary.ipa
#
# What it does, in order:
#   1. Makes the native project (ios/) from app.config.ts, if it is not there.
#   2. Builds the Release configuration for a real iPhone, without signing.
#   3. Wraps the .app in Payload/ and zips it as an .ipa.
#
# The JavaScript is compiled into the app, so it runs without your Mac or
# Metro. So is the backend address: see the warning this prints about it.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/build/ipa"
DERIVED="$ROOT/build/derived"
DEVICE_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --device-only) DEVICE_ONLY=true ;;
    -h | --help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This has to run on a Mac with Xcode installed." >&2
  exit 1
fi
if ! command -v xcodebuild > /dev/null; then
  echo "xcodebuild was not found. Install Xcode, open it once, then run:" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

# --- The backend --------------------------------------------------------------

# Expo reads .env.local while it compiles the app, so whatever address is in it
# ends up inside the .ipa. For --device-only it is moved aside for the build and
# put back afterwards, however the build ends.
ENV_FILE="$ROOT/.env.local"
ENV_ASIDE="$ROOT/.env.local.sideload-aside"
restore_env() {
  if [[ -f "$ENV_ASIDE" ]]; then mv "$ENV_ASIDE" "$ENV_FILE"; fi
}
trap restore_env EXIT

if $DEVICE_ONLY; then
  if [[ -f "$ENV_FILE" ]]; then mv "$ENV_FILE" "$ENV_ASIDE"; fi
  say "Building for this phone only: no accounts, no sync, no notes from the assistant."
elif [[ -f "$ENV_FILE" ]]; then
  URL="$(grep -E '^EXPO_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  if [[ -z "$URL" ]]; then
    say "No backend address in .env.local, so the app will run on the phone only."
  else
    say "The app will connect to: $URL"
    case "$URL" in
      *127.0.0.1* | *localhost* | *192.168.* | *://10.* | *172.1[6-9].* | *172.2[0-9].* | *172.3[0-1].* | *.local*)
        warn "That address is on your Mac or your home network. Someone testing anywhere"
        warn "else cannot reach it, and signing in will fail for them. For testers away"
        warn "from your Wi-Fi, use a hosted Supabase project (GOING_LIVE.md), or build"
        warn "with --device-only."
        ;;
    esac
  fi
else
  say "No .env.local, so the app will run on the phone only (no accounts or sync)."
fi

# --- 1. The native project ----------------------------------------------------

if [[ ! -d "$ROOT/ios" ]]; then
  say "Making the native project from app.config.ts…"
  # Prebuild rewrites the scripts in package.json; keep the committed ones.
  cp package.json build-ipa.package.json.bak
  npx expo prebuild --platform ios
  mv build-ipa.package.json.bak package.json
fi

WORKSPACE="$(find "$ROOT/ios" -maxdepth 1 -name '*.xcworkspace' | head -1)"
if [[ -z "$WORKSPACE" ]]; then
  echo "No .xcworkspace in ios/. Delete the ios folder and run this again." >&2
  exit 1
fi
SCHEME="$(basename "$WORKSPACE" .xcworkspace)"

# --- 2. Build, unsigned -------------------------------------------------------

# xcpretty shortens Xcode's output a great deal when it is installed; without
# it, the full log is shown.
tidy() {
  if command -v xcpretty > /dev/null; then xcpretty; else cat; fi
}

say "Building $SCHEME (Release, for iPhone). The first time takes a while…"
rm -rf "$DERIVED"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build | tidy

APP="$(find "$DERIVED/Build/Products/Release-iphoneos" -maxdepth 1 -name '*.app' | head -1)"
if [[ -z "$APP" ]]; then
  echo "The build finished but no .app was found. Scroll up for the error." >&2
  exit 1
fi

# --- 3. Package ---------------------------------------------------------------

say "Packaging…"
rm -rf "$OUT"
mkdir -p "$OUT/Payload"
cp -R "$APP" "$OUT/Payload/"
(cd "$OUT" && zip -qry "$SCHEME.ipa" Payload && rm -rf Payload)

say "Done: build/ipa/$SCHEME.ipa"
echo "Send that file to your tester, with SIDELOADING.md."
echo "It is unsigned: they sign it with their own Apple ID when they install it."
