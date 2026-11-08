# Letting someone test Diary for free (Sideloadly or AltStore)

You make one file, `Diary.ipa`, on your Mac and send it to your tester. They put
it on their iPhone with a free tool and their **own** free Apple ID. Nobody
pays for a developer account.

The catch, which is Apple's rather than the tools': an app installed with a
free Apple ID stops opening after **7 days** until it is refreshed. Both tools
can refresh it, and nothing in the app is lost when that happens.

---

## Part 1 — for you: making the file

### Decide what the app connects to

The backend address is built into the file, so decide before you build.

- **Your tester is not on your Wi-Fi:** the Supabase running on your Mac is out
  of their reach, so signing in would fail. Either build with `--device-only`
  (below), or set up a hosted Supabase project first (GOING_LIVE.md) and put
  its address in `.env.local`.
- **Device only** means no account, no sync, no sharing, and no notes from the
  assistant. Everything else works, and their diary stays on their phone.

### Build it

On your Mac, in the project folder:

```bash
npm ci                                 # if dependencies changed since last time
npm run build:ipa                      # uses .env.local as it is
npm run build:ipa -- --device-only     # or: no backend at all
```

It prints the backend address it is building in, and warns if that address only
works on your home network. The file is `build/ipa/Diary.ipa`. Send it however
you like — AirDrop, iCloud Drive, a Google Drive link — along with Part 2 of
this page.

The first build takes 10–15 minutes; later ones are quicker. If you changed
`app.config.ts` since your last build, run `rm -rf ios` first so the native
project is made again from it.

The `.ipa` is deliberately **unsigned**. Signing happens on your tester's side,
with their Apple ID, when they install it.

### Sending an update

Build again and send the new file. Installing it over the old one keeps their
diary, as long as the bundle ID stays the same (see "App ID not available"
below).

---

## Part 2 — for your tester: installing it

You need the `Diary.ipa` file, an iPhone, a cable, and a Mac or a Windows PC.

**A word about your Apple ID first.** Both tools ask for your Apple ID password,
which they pass to Apple to create the signature that lets the app run. They are
widely used, but they are not made by Apple. Some people use a spare Apple ID
for this; that works just as well.

### The easy way: Sideloadly

1. Download Sideloadly from **sideloadly.io** and install it.
   On Windows, also install **iTunes** and **iCloud** — the versions from
   Apple's website, not the Microsoft Store.
2. Plug your iPhone into the computer, unlock it, and tap **Trust**.
3. Open Sideloadly. Drag `Diary.ipa` into it, type your Apple ID email, and
   click **Start**. Enter your password and the code Apple sends you.
4. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode**.
   It restarts the phone. (The setting only appears once something has been
   installed this way.)
5. Open **Settings → General → VPN & Device Management**, tap your Apple ID, and
   tap **Trust**.
6. Open Diary.

**Every 7 days:** plug in and press Start again with the same file — or turn on
Sideloadly's automatic refresh, which renews it over Wi-Fi while the computer is
on. Your diary is kept.

### The other way: AltStore

1. Install **AltServer** from **altstore.io** on your Mac or PC, and use it to
   install the AltStore app on your iPhone (its site walks through this).
2. Do steps 4 and 5 above.
3. Send `Diary.ipa` to your phone (AirDrop, Files, email), open it, and choose
   **AltStore** from the share sheet.

AltStore refreshes apps in the background whenever your phone and the computer
running AltServer are on the same Wi-Fi.

### If something goes wrong

| What you see                                         | What to do                                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _App ID not available_ / _cannot register bundle ID_ | Someone else's Apple ID already uses this app's ID. In Sideloadly's advanced options, change the bundle ID to something of your own (adding your initials to the end is fine) and press Start again. AltStore does this for you. |
| _Maximum number of apps_                             | A free Apple ID can have 3 of these apps installed at once. Delete one you no longer use.                                                                                                                                        |
| The app will not open after a week                   | The 7 days ran out. Refresh it as above.                                                                                                                                                                                         |
| _Untrusted Developer_                                | Step 5.                                                                                                                                                                                                                          |
| Signing in fails                                     | The build has no backend you can reach. Ask whoever sent it for a device-only build, or one on a hosted backend.                                                                                                                 |

**Do not delete the app to fix a problem** unless you are happy to lose what is
in it. In a device-only build, the diary lives only on your phone, and deleting
the app deletes it.

---

## What a free install cannot do

Sign in with Apple and push notifications are switched off in this app because
free Apple IDs cannot sign them. Reminders still work — they are scheduled on
the phone. Transcription works too: it happens on the phone.
