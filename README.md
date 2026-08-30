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

The app runs without Supabase credentials until Phase 2 (authentication) lands —
the design gallery at `/` needs no backend.

### Testing from an iPhone with no computer

An iPhone cannot run Metro — it is a Node process, and iOS does not allow
arbitrary runtimes — so the dev server has to live somewhere. GitHub Codespaces
works entirely from mobile Safari and is the least friction:

1. On github.com, open this repo → **Code → Codespaces → Create codespace**
2. Wait for the container (`.devcontainer/` installs dependencies automatically)
3. In the terminal: `npm run start:tunnel`
4. Point the iPhone **Camera app** at the QR code and tap the banner

Tunnel mode is required. The Codespace is not on your local network, so the
default LAN QR code will never connect.

Use `npm run web` and open the forwarded port on 8082 for a quick look at layout
and colour without a phone — but haptics, real font rendering and gestures only
exist on a device, so judge the feel in Expo Go.

### Running on Replit

Import the repo, then press **Run**. That starts Expo in tunnel mode
(`npm run start:tunnel`).

Tunnel mode is not optional here: your phone cannot reach Replit's container
over the local network, so the default LAN QR code will never connect. The
tunnel routes through ngrok instead, which works from anywhere.

For a quick look without a phone, run `npm run web` and open Replit's webview.
The web target is for previewing layout and colour only — fonts, haptics and
native gestures behave differently from a real device, so judge the real feel in
Expo Go.

First run on Replit is slow: the dependency install is large and Metro has to
build the whole bundle. If Metro is killed part-way, it has run out of memory —
`npm run web` is lighter than tunnel mode and usually survives.

## Scripts

| Command             | Does                                        |
| ------------------- | ------------------------------------------- |
| `npm start`         | Start the Expo dev server                   |
| `npm run typecheck` | TypeScript, strict, no emit                 |
| `npm run lint`      | ESLint, warnings treated as errors          |
| `npm run format`    | Prettier write                              |
| `npm test`          | Jest                                        |
| `npm run verify`    | typecheck + lint + test — run before commit |

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

Phase 1 of 12 complete: project architecture and design system.

Next: authentication and onboarding.
