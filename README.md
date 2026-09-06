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

No Supabase credentials are needed yet. Entries are kept on the device until
authentication lands, so the app runs end to end with no backend at all.

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
npm run db:types     # regenerate src/types/database.generated.ts
npm run test:rls     # two-user isolation suite
npm run db:stop
```

`npm run test:rls` is the suite that matters most in this project. It creates two
real users and has one of them attempt, with nothing but guessed ids, to read,
edit, delete and plant data in the other's diary — entries, threads, transcripts,
membership and storage objects alike. All 25 attempts must fail.

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

## Security

Journal entries are treated as highly sensitive throughout.

- Row Level Security on every user table; the database, not the client, is the
  authority on who can read what.
- Private storage buckets with short-lived signed URLs. No media is ever public.
- Only the Supabase anon key ships in the app. The service role key must never
  appear in client code, `app.config.ts`, or this repository.
- `.env*` is gitignored. `.env.example` documents the shape without the values.

## Accessibility

Minimum 44pt touch targets, WCAG AA contrast in both themes (asserted by tests in
`src/design/__tests__/contrast.test.ts`), Dynamic Type support, and every
animation gated on the OS Reduce Motion setting.

## Status

Built: design system, database schema with row level security, app lock,
onboarding, the daily question, calendar, compose and entry detail.

Entries are held on the device for now — the store in
`src/features/entries/entryStore.ts` wears the same shape as the
`journal_entries` table, so moving it to Supabase changes that file and nothing
that calls it.

Next: authentication, then video capture with on-device transcription.
