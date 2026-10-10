# Getting Diary onto an iPhone

Four ways, in order of how much they cost you. Only one of them produces a real
app you can keep.

The short version: **an installable `.ipa` cannot be produced on Linux, and
iOS will not run one that is not signed.** Those are two separate walls and
both are Apple's, not Expo's. Compiling needs Xcode, which only runs on macOS.
Installing needs a signing certificate and a provisioning profile naming your
device. Every option below is a different way around those two facts.

---

## 1. Expo Go — free, works in two minutes, not a real app

```bash
npm install
npx expo start --tunnel
```

Scan the QR code with the Camera app. Expo Go has to be installed from the App
Store first, and it must be the build for **SDK 57** — a mismatch here is what
caused the "project is incompatible" message before.

**What works:** everything except the four things in section 5.

**What it is not:** an app. It lives inside Expo Go, it disappears when you
delete Expo Go, it has no icon on your home screen, and it cannot be given to
anybody else. Good for using the app today; not good for keeping a diary in.

---

## 2. EAS Build — £79/year, no Mac needed, a real app

This is the path. Expo compiles on their own Apple hardware in the cloud, signs
it, and gives you a link that installs straight onto the phone.

It needs a paid Apple Developer Program membership (£79/year). Not because
Expo asks for it — because an ad-hoc provisioning profile, the thing that lets
an app run on a named device outside the App Store, can only be issued through
the Apple Developer portal, and that portal requires a paid membership.

```bash
npm install -g eas-cli
eas login                      # an Expo account, free
eas init                       # links this repo to an EAS project

# Register the phone. Opens a page; install the profile it offers,
# then Settings → Profile Downloaded → Install.
eas device:create

# Build it. Expo will offer to create the certificate and profile for
# you — say yes to all of it.
eas build --platform ios --profile preview
```

Twenty minutes later you get a URL. Open it **on the phone**, tap install, then
Settings → General → VPN & Device Management → trust the developer. The app
appears on the home screen and stays there for a year.

`eas device:create` has to be run once per device, and a build only installs on
devices registered _before_ that build was made.

### The backend

Without a Supabase URL the app runs device-only: entries stay on the phone,
there is no sign-in, nothing syncs. That is a legitimate way to use it and the
app says so on the account screen.

For a build that syncs, the project needs a hosted Supabase project (the local
stack at `127.0.0.1` is unreachable from a phone), and then:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
```

The anon key is safe to ship — every table is behind Row Level Security. The
service role key must never go near this project.

---

## 3. Xcode on a borrowed Mac — free, expires every 7 days

A free Apple ID can sign an app through Xcode directly. The profile lasts
**seven days**, after which the app refuses to open until it is re-signed.

```bash
npx expo prebuild --platform ios   # generates ios/, which is gitignored
npx expo run:ios --device          # installs pods, builds, installs
```

The first run asks which device and offers to set up signing. If it needs
doing by hand: `open ios/Diary.xcworkspace`, then select the project →
Signing & Capabilities → tick _Automatically manage signing_ → pick your Apple
ID under Team.

`ios/` is generated, not committed. Delete it whenever; `prebuild` makes it
again from `app.config.ts`, which is where the real configuration lives.

Fine for seeing it on the phone. Not somewhere to keep a diary, because the
seventh day arrives.

---

## 4. AltStore or Sideloadly — free, still 7 days, still needs an .ipa

These re-sign an existing `.ipa` with your own Apple ID from a Mac or Windows
PC, and refresh it before it expires. They do not solve the problem, they move
it: you still need somebody to have compiled the `.ipa` on a Mac first, and the
free-Apple-ID seven-day limit still applies.

Worth knowing about, not worth doing instead of option 2.

---

## 5. What needs a real build either way

These are inert in Expo Go and only start working once the app is built
properly (options 2 or 3):

- **Transcription** of video and voice entries.
- **Notifications** — the morning question, and a resurfaced memory.
- **Sign in with Apple.**
- **Video compression**, so a long recording is not a 400MB upload.

Everything else — all four capture formats, the calendar, patterns, quiet
dates, letters, sharing, search, export, the app lock — works in Expo Go today.

---

## Before a build you would actually keep

Not blocking, but a real build makes them visible:

- **No icon or splash artwork.** The app uses Expo's defaults, deliberately,
  rather than committing placeholder art. A sideloaded build will have a blank
  white icon on the home screen.
- **The assistant has never called a model.** It needs a provider key in
  Supabase secrets. Everything up to that line is built and tested; the
  question on the Today screen is still chosen from a fixed pool.
- **`version` in `app.config.ts` is `0.1.0`** and the build number is managed
  by EAS (`autoIncrement` on the production profile only).
