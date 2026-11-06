# Testing on your Mac

In order of how much each step needs. Every step works without the £79 Apple
Developer account; that only becomes necessary for TestFlight, for builds that
last longer than a week, and for Sign in with Apple.

| Step                             | What it tests                           | Needs                    |
| -------------------------------- | --------------------------------------- | ------------------------ |
| 1. Simulator + Expo Go           | Most screens, in five minutes           | Xcode                    |
| 2. A real build in the Simulator | The actual app, native modules and all  | Xcode                    |
| 3. A real build on your iPhone   | Camera, real Face ID, the real feel     | A free Apple ID, a cable |
| 4. A local backend               | Accounts, sync, sharing, password reset | Docker                   |

---

## 0. Once: set up the Mac (about an hour, mostly downloads)

**Xcode**, from the App Store. React Native 0.86 needs **16.1 or later** —
whatever the App Store gives you today is fine. Open it once, accept the
licence, and let it install its components. If it asks which platforms to
install, include iOS.

Then, in Terminal:

```bash
# Make sure the command-line tools point at the Xcode you just installed.
sudo xcode-select -s /Applications/Xcode.app

# Homebrew, if you don't have it: https://brew.sh — then:
brew install node@22 cocoapods
```

Node needs to be 20.19.4+, 22.13+ or 24.3+. CocoaPods is installed up front
because otherwise Expo tries to install it halfway through your first build
and asks for your password at an awkward moment.

**Get the code — on the right branch.** This matters more than anything else
on this page:

```bash
git clone https://github.com/mk017-hk/DiaryApp.git
cd DiaryApp
git checkout claude/journal-app-setup-dmpoba
npm ci
```

`main` is still on Expo SDK 54 and has none of the work from the last few
weeks. A clone that stays on `main` gives you the old app — and the "project
is incompatible with this version of Expo Go" error from before. (The repo is
private, so git will ask you to sign in; `brew install gh && gh auth login` is
the least painful way.)

---

## 1. The Simulator, with Expo Go — no build at all

```bash
npx expo start
```

Press **`i`**. Expo boots an iPhone simulator, installs Expo Go on it, and
opens the app. With no backend configured it runs device-only: no sign-in,
entries stay on the simulated phone. That is a real way to use the app, and
the quickest way to look at every screen.

---

## 2. A real build in the Simulator

```bash
npx expo run:ios
```

The first build takes 10–15 minutes. Later ones take about a minute. This is
the actual app — your bundle identifier, your permission strings, every native
module — running in the Simulator. No Apple ID, no signing.

What you can test here, and how:

- **Face ID:** Simulator menu → **Features → Face ID → Enrolled**. Then, when
  the app asks, **Features → Face ID → Matching Face** (or **Non-matching**, to
  see a failure).
- **Photos:** the Simulator has sample photos in its library.
- **Voice notes:** the Simulator uses your Mac's microphone.
- **Video:** the one thing you cannot test here. The Simulator has no camera.
  That is step 3.
- **Transcription:** record a voice note, save it, and open the entry. _What
  you said_ fills in after a few seconds; the first time, iOS asks whether
  Diary may use speech recognition. This needs this kind of build — in Expo
  Go the entry says so instead. If the Simulator's speech recognition is not
  set up for your language, try it on the phone in step 3.

This is a **Debug** build: it loads its code from Metro, the server the
command starts. Leave that Terminal window open. Edits to the code reload
in the app straight away.

---

## 3. On your iPhone — free, for seven days at a time

**Once:**

1. Plug the iPhone into the Mac with a cable. Unlock it and tap **Trust**.
2. On the iPhone: **Settings → Privacy & Security → Developer Mode → On**. It
   restarts. (The setting appears only after Xcode has seen the phone, so if
   it is missing, open Xcode with the phone plugged in first.)
3. In Xcode: **Settings → Accounts → +** and sign in with your Apple ID.

**Then:**

```bash
npx expo run:ios --device
```

Pick your iPhone from the list. If Xcode complains about signing, open
`ios/Diary.xcworkspace`, select **Diary** → **Signing & Capabilities**, tick
**Automatically manage signing**, and choose your **Personal Team**. Run the
command again.

The first time the app opens, iOS refuses it as an _Untrusted Developer_. Go
to **Settings → General → VPN & Device Management**, tap your Apple ID, and
tap **Trust**.

**Two kinds of build:**

- `npx expo run:ios --device` makes a **Debug** build. It loads code from your
  Mac, so the phone must be on the same Wi-Fi and Metro must be running. If
  iOS asks whether Diary may _find devices on your local network_, allow it —
  that is how it reaches your Mac.
- `npx expo run:ios --device --configuration Release` makes a build that runs
  on its own, away from the Mac. This is the one to actually use for a few
  days.

**What a free Apple ID means:** the build stops opening after **seven days**,
and running the command again re-signs it. Your diary on the phone is not
lost when that happens; it is there again once the app is re-signed. You can
have three apps signed this way at once.

**Sign in with Apple and push notifications are switched off in these
builds**, on purpose. A free Apple ID cannot sign an app that has either
capability — Xcode refuses outright. They come back with `APPLE_SIGN_IN=1` and
`PUSH_NOTIFICATIONS=1` once there is a paid account. Reminders still work:
they are local notifications, scheduled on the phone, and need neither. See
`app.config.ts`.

---

## 4. Accounts, sync and sharing: a backend on your Mac

The whole Supabase stack runs on your Mac. Nothing is hosted; nothing costs
anything. It is the same stack the 361 integration tests run against.

**Once:** install **Docker Desktop** (or OrbStack, which is lighter) and start
it.

```bash
npx supabase start        # first time: downloads for about 10 minutes
npx supabase status       # prints the API URL and the anon key
```

If it stops on an unhealthy `vector` container, run
`npx supabase start -x vector` instead — that service only collects logs.

**Point the app at it** with a file called `.env.local` in the project folder.
It is gitignored; it never leaves your Mac.

For the **Simulator**, which shares the Mac's network:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key from supabase status>
```

For the **iPhone**, use your Mac's address instead — `127.0.0.1` on the phone
means the phone itself:

```bash
ipconfig getifaddr en0    # prints something like 192.168.1.23
```

```bash
EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.23:54321
```

Then **rebuild** with `npx expo run:ios` (or `--device`). The address is
written into the app when it is built, so restarting Metro alone is not
enough. A rebuild after the first is about a minute.

### Things worth trying

- **Notes on an entry.** Turn the assistant on (You → Account), write or
  record something, and open it once it has synced. Without an API key the
  notes card says the assistant is not connected yet — that is the local stack
  working. To see real notes, put a key in `supabase/functions/.env` as
  `ANTHROPIC_API_KEY=...` (gitignored) and restart
  `npx supabase functions serve`.

- **Sign up.** Confirmation emails are off on the local stack, so you are in
  straight away.
- **Two devices, one account.** The Simulator and your iPhone, both pointed at
  the Mac's IP address. Write on one, and it appears on the other.
- **Sharing.** Sign up a second account on the other device, invite it from
  **You → Sharing**, and join with the code. The invited person opens the
  diary from **Sharing → Shared with you**, reads it, and can add to it — and
  anything the owner wrote with _Just for me_ on never appears for them. A
  shared diary is read live from the account, so that device needs to reach
  the Mac.
- **Cycle tracking across two devices.** Mark a period on one; it appears on
  the other after a sync. Then share the diary with the second account and
  check that nothing about the cycle is visible there.
- **Somebody else signing in on your phone.** This needs account A's session
  to end _without_ tapping Sign out, which wipes the phone anyway. With the
  phone signed in as A, delete A in Supabase Studio (Authentication → Users).
  The app notices when its session next refreshes — that can take up to an
  hour, because the token it already holds stays valid until then — and goes
  back to the welcome screen. Then sign in as B. B should find an empty diary,
  and nothing of A's should appear in B's account in Studio.
- **A forgotten password — the real email, the real link.** Do this one in the
  **Simulator**:
  1. Sign out, tap **Forgot password**, enter the account's email.
  2. In the Simulator, open **Safari** and go to `http://127.0.0.1:54324`.
     That is Mailpit, which catches every email the local stack sends.
  3. Open the reset email and tap its link. iOS asks to open it in **Diary**.
  4. The app should open on _Choose a new password_.

  On the iPhone the link inside the email points at `127.0.0.1`, which there
  means the phone, so it goes nowhere — the Simulator is where to test this.

- **The database itself:** `http://127.0.0.1:54323` in the Mac's browser opens
  Supabase Studio, where you can see every row the app has written.

---

## The test suites, on the Mac

```bash
npm run verify            # typecheck, lint, and the 521 unit tests
```

The integration tests need the local stack from step 4, plus the Edge
Functions running in a second Terminal window:

```bash
npx supabase functions serve      # leave this running
npm run test:rls                  # 361 tests against the real database
```

---

## When something goes wrong

| What you see                                                    | What it means                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| _Project is incompatible with this version of Expo Go_          | You are on `main`. `git checkout claude/journal-app-setup-dmpoba`, then `npm ci`.                   |
| _Personal development teams do not support the … capability_    | An old checkout, or `APPLE_SIGN_IN=1` / `PUSH_NOTIFICATIONS=1` is set. Pull, and unset them.        |
| _Untrusted Developer_                                           | Settings → General → VPN & Device Management → Trust.                                               |
| The app opens to a red screen saying it cannot connect to Metro | Debug build, and the phone cannot see the Mac. Same Wi-Fi, Metro running — or make a Release build. |
| _iOS 2x.x is not installed_                                     | Xcode → Settings → Components, and install the iOS platform.                                        |
| Sign-in says there is no account service                        | `.env.local` is missing or wrong, or the app was not rebuilt after you changed it.                  |
| The app worked last week and now will not open                  | The free seven days ran out. Run the build command again.                                           |
