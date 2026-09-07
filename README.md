# Diary

A private space for your memories — text, photos, voice and video, held somewhere safe.

Built with React Native, Expo, TypeScript, Expo Router and Supabase.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm start
```

Then scan the QR code with Expo Go, or press `i` / `a` for a simulator.

Supabase credentials are optional. Without them the app detects it, keeps
everything on the device and skips the sign-in screen — which is how it runs in
Expo Go with no backend at all.

### Testing from an iPhone with no computer

An iPhone cannot run Metro — it is a Node process, and iOS does not allow
arbitrary runtimes — so the dev server has to live somewhere in the cloud.
Replit and GitHub Codespaces both work; Replit has a native iOS app, which is
easier on a phone than VS Code in mobile Safari.

**Replit** — import the repo and press **Run**. That installs dependencies and
starts the tunnel.

**Codespaces** — on github.com, **Code → Codespaces → Create codespace**, then
run `npm run dev` in the terminal. That installs anything new and starts the
tunnel, which matters after a pull that changed dependencies.

Either way, point the iPhone **Camera app** at the QR code and tap the banner.
iOS Expo Go has no built-in scanner — Android is the platform that scans from
inside the app. If one screen makes scanning awkward, press `s` in the Expo
terminal to switch to a tappable link instead.

Tunnel mode is required in both. Neither container is on your local network, so
the default LAN QR code will never connect.

For a quick look without a phone, run `npm run web` and open the forwarded port 8082. The web target previews layout and colour only — video, haptics, real font
rendering and native gestures exist only on a device, so judge the feel in
Expo Go.

First run is slow either way: the dependency install is large and Metro builds
the whole bundle. If Metro is killed part-way it ran out of memory; `npm run web`
is lighter than tunnel mode and usually survives.

### Expo Go and SDK version

iOS Expo Go loads only the SDK matching its own major version, and Apple ships
just the latest build — there is no way to install an older one. So the project
SDK has to track whatever is currently in the App Store.

If a device reports an incompatible SDK, check what the store is actually
serving before changing anything:

```bash
curl -s "https://itunes.apple.com/lookup?id=982107779" | grep -o '"version":"[^"]*"'
```

This has already moved once: the store was on 54.0.2 at the end of August and
57.0.9 by early September.

## Database

The schema lives in `supabase/migrations/`. Develop against a local stack rather
than a hosted project, so the security policies can be tested destructively
before any real diary exists.

```bash
npm run db:start     # local Postgres, Auth, Storage (needs Docker)
npm run functions    # Edge Functions — needed by the deletion suite
npm run db:types     # regenerate src/types/database.generated.ts
npm run test:rls     # isolation, deletion, sync and media
npm run db:stop
```

`npm run test:rls` is the suite that matters most in this project.

The **isolation** half creates two real users and has one of them attempt, with
nothing but guessed ids, to read, edit, delete and plant data in the other's
diary — entries, threads, transcripts, membership and storage objects alike.
Every attempt must fail. It also signs a user up through the app's own path,
anon key and all, and checks that the session this produces is no more
privileged than any other.

The **deletion** half runs against the real `delete-account` Edge Function,
which is the only code in the project holding the service role key. It checks
that a deletion takes the entries, the diary and the stored media with it, and
that a signed-in user cannot aim it at somebody else — by body parameter or by
query string. That last test exists because a deliberately broken version of
the function, one that read a user id from the request body, passed the
earlier version of the suite: it never sent a body. It does now.

The **sync** half checks the SQL that conflict resolution assumes — that a
client may date its own edit, that an older edit cannot overwrite a newer one
however late it arrives, and that a deletion is something a second device can
actually find out about. The **media** half checks the private bucket: nothing
is reachable without a signed URL, only a member can mint one, and an
interrupted upload leaves a row the reconciler can find.

Entries belong to a **diary**, and diaries have **members**. A solo user has one
personal diary, created on signup and invisible in the UI; a shared diary is the
same row with a second member. Every policy asks "is the caller a member of this
diary?" through the `is_diary_member` helper, which is `SECURITY DEFINER` — a
policy on `diary_members` that queried `diary_members` would recurse forever.

## Scripts

| Command                | Does                                         |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Install, then start the tunnel — one command |
| `npm start`            | Expo dev server (LAN — for local machines)   |
| `npm run start:tunnel` | Expo dev server over a tunnel (cloud/Replit) |
| `npm run web`          | Web preview on port 8082                     |
| `npm run typecheck`    | TypeScript, strict, no emit                  |
| `npm run lint`         | ESLint, warnings treated as errors           |
| `npm run format`       | Prettier write                               |
| `npm test`             | Jest                                         |
| `npm run functions`    | Serve Edge Functions locally                 |
| `npm run test:rls`     | Integration suites, against local Supabase   |
| `npm run verify`       | typecheck + lint + test — run before commit  |

## Project structure

```
app/          Expo Router routes. Navigation and composition only —
              no business logic, no data access.
src/
  design/     Tokens (colour, type, space, motion) and the theme provider.
  components/ Shared primitives. The only place raw react-native views are styled.
  features/   Feature modules: components, hooks and data access per feature.
  services/   Supabase repositories, secure storage, logging.
  hooks/      Cross-feature hooks.
  lib/        Pure utilities.
  types/      Domain types and generated database types.
  validation/ Zod schemas shared by forms and the API boundary.
supabase/     Migrations, policies and seed data.
```

## Conventions

- **Strict TypeScript.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **All text goes through `<Text>`** from `src/components`, so typography stays
  consistent and Dynamic Type is never accidentally disabled.
- **UI never talks to Supabase directly.** Data access lives in repositories under
  `src/services/supabase/`; ESLint enforces this.
- **Never use `console` directly.** Use `logger` from `src/services/logger`, which
  redacts entry content, tokens and storage paths. ESLint enforces this too.
- **Every data-backed surface renders through `<StateView>`**, which makes the
  loading, empty and error states structural rather than optional.

## Accounts

Email and password, plus Sign in with Apple. Sessions live in the device
keychain via `secureStorageAdapter`, chunked around SecureStore's 2048-byte
limit.

Three gates decide what you see, and they are deliberately separate:

1. **Onboarding** comes first, before any account exists. The first thing
   somebody meets should be the diary asking their name, not a form asking for
   credentials for a thing they have not seen yet.
2. **The session** decides whether there is an account. Without one you get
   `app/(public)/` — welcome, sign in, sign up, forgot password.
3. **The app lock** decides whether the person holding the phone may open it.
   It is the outermost gate, because there are entries on this device whether
   or not a session is currently valid.

With no Supabase credentials the session gate reports `unavailable` and steps
aside: entries are local until Phase 2, so the diary runs end to end with no
backend, which is how it runs in Expo Go.

Two things worth knowing:

- **Nothing reveals whether an account exists.** Sign-in says the same thing
  for a wrong password as for an unknown address, and password reset gives the
  same confirmation either way. Who keeps a diary here is not a question this
  app answers.
- **Sign-in with Apple renders only where it can work** — not on Android, not
  on web, and not in Expo Go, where Apple signs the credential for Expo's
  bundle identifier rather than ours. It needs the development build that
  Phase 4 requires anyway.

Account deletion is built now rather than at submission. It lives in
`supabase/functions/delete-account/`, takes no user id — the identity comes
from the verified JWT and nothing else — and clears storage objects before
the cascade removes the rows that name them.

## Sync

Entries are written to the device first and pushed afterwards. This is not a
cache in front of Postgres — it is the other way round: the device is what
screens read from, so capture never waits on a connection and an entry cannot
be lost to a dropped signal.

Ids are generated on the device, so the local row and the remote row are the
same row from the moment it exists. Nothing is reconciled later, and an entry
written in flight mode already knows its own name.

A pass pushes, then pulls, then uploads media, and runs on sign-in, on
foregrounding, and a debounced moment after any write.

**Conflicts.** A push carries `updated_at` — when the edit was made, not when
it arrived. The database keeps whichever is newer and, on a stale write,
returns the row unchanged, so the losing device is handed the winner in the
same round trip. The rule is a trigger (`set_entry_updated_at`) rather than
client code, because a device can be wrong, out of date, or lying.

**Deletes** leave a tombstone. Removing the row outright would leave nothing to
tell the server, and the entry would come back on the next pull.

**Media** goes to the private bucket, and the `entry_media` row is written
_before_ the bytes are sent — an upload killed by a dead battery then leaves
something `stale_pending_media` can find, rather than an object nobody knows
about that is billed for forever. Uploads stream off disk rather than through
`supabase.storage.upload`, which would want a hundred-megabyte clip in memory
first. Reads go through signed URLs minted on demand, cached in memory for
their lifetime and never written to disk.

## Security

Journal entries are treated as highly sensitive throughout.

- Row Level Security on every user table; the database, not the client, is the
  authority on who can read what.
- Private storage buckets with short-lived signed URLs. No media is ever public.
- Only the Supabase anon key ships in the app. The service role key must never
  appear in client code, `app.config.ts`, or this repository — it exists only
  in Edge Function secrets.
- `.env*` is gitignored. `.env.example` documents the shape without the values.
- Raw backend errors never reach a screen. Everything a user sees is mapped in
  `src/services/supabase/errors.ts`, so no message names a table, quotes an
  address back, or leaks whether an account exists.

One exception, stated plainly: on **web** the session goes to `localStorage`,
because `expo-secure-store` is native-only and the alternative was an auth flow
that silently forgot you on every reload. Web is a layout preview and never a
shipping target; on iOS this is the keychain.

## Accessibility

Minimum 44pt touch targets, WCAG AA contrast in both themes (asserted by tests in
`src/design/__tests__/contrast.test.ts`), Dynamic Type support, and every
animation gated on the OS Reduce Motion setting.

## Status

See [ROADMAP.md](ROADMAP.md) for the full build plan and where this sits in it.

Built: design system, database schema with row level security, app lock,
onboarding, the daily question, calendar, compose, entry detail, authentication
with account deletion, and entry sync with media upload.

Entries and recordings now reach the account and come back on another device.
The device remains the authority — see [Sync](#sync).

Next: on-device transcription, which is what turns a recording into something
the assistant can eventually read. That needs a development build.
