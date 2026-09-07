# Diary: build plan

From the current repo state to the product described in the concept notes: an
emotional archive of your life, not a journal.

Phases are ordered by dependency, not by appeal. Everything in the concept
except resurfacing is blocked on Phase 1 and Phase 2.

---

## Where the repo actually is

**Built.** Design system with contrast tests. Full Postgres schema with Row
Level Security and a 25 case two user isolation suite. App lock with PIN,
biometrics and a privacy cover. Onboarding, Today, calendar, compose with video
capture, entry detail, security screen. On This Day resurfacing.

**Not built.** Authentication. Any network path for entries. Transcription. The
assistant. Future Me. Sharing UI. Billing. Notifications. Timeline. Dashboard.
Memory movies.

**The honest gap.** `src/features/assistant/prompts.ts` is a fixed pool of
sentences chosen by day of month. It has never read an entry. The line that
sells the app, "you were sad Monday and Tuesday, how are you today", does not
exist in any form. It is Phase 5, and Phases 1 through 4 exist to make it
possible.

`src/features/entries/entryStore.ts` writes to AsyncStorage. It was built to
wear the shape of `journal_entries`, so Phase 2 changes that file and nothing
that calls it. That decision holds up.

Two things have moved since this was written. `prompts.ts` now varies by a tone
the user picks at onboarding and by what they said they were here for — still a
fixed pool, so the gap above stands unchanged, but the surface the assistant
will speak through already exists. And profile persistence is deliberately off
(`PERSIST_PROFILE` in `profileStore.ts`) while onboarding is being shaped, so
the app starts fresh each launch. Turn it back on before Phase 1.

---

## Phase 0: decisions before code

Six answers, each of which changes the schema or the architecture if answered
late.

1. **Where the model runs.** Recommendation: Supabase Edge Function only. No
   provider key ever ships in the app, and the context assembly rules stay
   server side where the client cannot bypass them.
2. **Transcription.** On device via a native speech API, or server side via a
   hosted Whisper. On device is better for privacy and is what the schema
   comments assume. Both force a development build.
3. **What is paid.** The notes put shared diaries behind a subscription.
   Candidates for the same tier: memory movies, unlimited AI history, unlimited
   video length.
4. **What a lapsed subscription does to a shared diary.** Recommendation: read
   only, never deleted, both members keep their own entries. Write this down
   before anyone pays.
5. **Retention and deletion.** What a delete actually deletes, including media
   in storage, transcripts, `ai_messages` rows and the other member's copy in a
   shared diary.
6. **Crisis policy.** Below.

### Already decided

1, 2 and 6 are settled. The model runs server side in an Edge Function only.
Transcription is on device, via `expo-speech-recognition`, which needs a
development build — the same build video compression and push notifications
need, so Phase 4 is one trip. Crisis policy is written below.

**Open: 3, 4 and 5.** None of them block Phase 1, but 4 and 5 must be written
down before anyone pays or deletes anything.

---

## Phase 1: authentication

Unblocks everything. Nothing else in this document ships first.

- Supabase email auth plus Sign in with Apple. Apple requires the latter if any
  third party sign in is offered, and this app will be reviewed carefully.
- `src/services/supabase/secureStorageAdapter.ts` already exists and is tested.
  Wire it as the session store.
- Session gate in `app/_layout.tsx`, above `LockGate`. Auth decides whether
  there is an account, the lock decides whether this person may open it. They
  are separate and should stay separate.
- `20260830000003_signup_and_storage.sql` already creates the personal diary on
  signup. Confirm it fires for the Apple path too.
- Build account deletion now, not at submission. It is an App Store requirement
  and it is easier to write while the schema is small.

**Done when** a new user signs up, gets a personal diary row, and the RLS suite
still passes against a real session rather than a test helper.

---

## Phase 2: entries into Postgres

- New repository `src/services/supabase/entries.ts` with the same signatures as
  `entryStore.ts`.
- Keep the local write. Capture must never depend on a connection, and a diary
  entry lost to a dropped signal is unforgivable in a product like this. The
  device write stays authoritative until the row is confirmed.
- Add a local outbox and a sync pass on foreground. Conflicts are rare here
  because entries are append mostly, so last write wins on `body` is acceptable
  if `updated_at` is respected.
- Media upload to the private bucket, resumable, writing `entry_media` as
  `pending` and flipping to `uploaded`. The `entry_media_pending_idx` index for
  reconciling abandoned uploads is already in the schema. Write the job that
  uses it.
- Signed URLs minted on demand, short expiry, never persisted.

**Done when** an entry recorded in flight mode appears on a second device after
signing in.

---

## Phase 3: the rest of capture

The notes list text, voice notes, video diaries and photos. Video exists.

- Voice notes with `expo-audio`, stored as `media_kind = 'audio'`.
- Photos through the same pipeline.
- Mood and emotion selection at capture, writing `entry_emotions`. Without this
  the timeline and dashboard in Phase 7 have nothing to draw.
- Thread assignment at capture. One quiet question: is this part of something
  you are already writing about. Threads are what let the assistant follow a
  story instead of reacting to yesterday.

---

## Phase 4: transcription, and leaving Expo Go

This is the cutover point. Transcription, push notifications, billing and
background work all need a development build, so plan the whole move here.

- EAS cloud builds mean no Mac is required, but an Apple Developer account is
  (£79 a year) and the test device has to be registered to a provisioning
  profile. Setting that up from a phone alone is awkward. Budget a session at a
  computer.
- Write the transcript to `entry_media.transcript` and copy it once into
  `journal_entries.body` as an editable draft. The schema comment already gets
  this right: correcting a mishearing must not destroy the record of what was
  said.
- `transcript_status` moves `pending` to `done` or `failed`, and a failure must
  never block saving the entry.

---

## Phase 5: the assistant

The product. Everything before this was scaffolding.

**Server side only.** An Edge Function assembles context and calls the model.
Context rules, enforced in SQL, not in the client:

- `profiles.ai_enabled` is true and `ai_consented_at` is set.
- Exclude entries where `ai_excluded` is true.
- Exclude every entry in a thread where `is_private` is true.
- Window of roughly the last 14 days, plus open threads regardless of age.

**Output** goes into `ai_messages` with `based_on_entry_ids` populated, so the
user can always see what a question was drawn from. That column is the honesty
feature of this app. Surface it in the UI.

**Copy rules**, extending the ones already written in `prompts.ts`:

- Never count days, never praise consistency, never mention an absence.
- Never diagnose, never interpret, never advise. Reflect and ask.
- Name what the person wrote, never what it means about them. "You wrote about
  your sister twice this week" is fine. "You seem anxious about your sister" is
  not.
- One question a day, dismissible, never repeated.

**Two surfaces.** The morning question on Today, and thread follow up, which is
the "you were sad Monday, how are you today" behaviour verbatim.

---

## Phase 6: resurfacing and notifications

- Move On This Day to a server query using `journal_entries_on_this_day_idx`.
- `expo-notifications` for the morning question and for a resurfaced memory.
- **The control that matters.** Let a thread be muted from resurfacing, and let
  a date range be muted. The concept notes use a miscarriage as the worked
  example. An unrequested "two years ago today" card can land on someone on the
  worst morning of their year. The schema already has `is_private` and
  `ai_excluded`. Expose them at capture time, in plain words, not buried in
  settings.
- Default notifications to off, or to one gentle daily prompt at a chosen time.

---

## Phase 7: emotional timeline and growth dashboard

Read only surfaces over data Phase 3 started collecting.

- **Timeline.** Mood over time, filterable by thread, tappable through to the
  entry.
- **Dashboard.** Recurring themes, drawn from `ai_messages` rather than
  recomputed. Most mentioned people and places from `people` and
  `location_label`. Cadence shown as texture, never as a streak.
- Aggregate in an RPC. Pulling a year of entries to the client to draw a chart
  defeats the point of the storage model.

---

## Phase 8: Future Me

New migration.

```sql
create table future_messages (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text check (char_length(body) <= 100000),
  unlock_on date not null,
  unlocked_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
```

**Sealed must mean sealed in the database.** A policy that returns the row and
lets the client hide it is theatre, and this project has not built anything
that way yet. The read policy carries `unlock_on <= current_date`. Media for a
future message needs the same treatment, so the signed URL is only mintable
after the date.

Delivery is a scheduled function plus a notification on the morning it opens.

---

## Phase 9: shared diaries

The schema is ready. `diaries`, `diary_members` and every policy asking
`is_diary_member` were built for this.

- `diary_invites` table, single use code or email, an accept RPC that inserts
  the membership. Never let the client insert into `diary_members` directly.
- Per entry visibility inside a shared diary. Two people sharing a record of
  something hard still need a page the other cannot read. This is a new column
  and a policy change, so decide it now rather than after launch.
- Leaving a shared diary: entries stay with their author, the other member
  loses access, nothing is destroyed.
- Extend the RLS isolation suite to cover a third user who was never a member,
  and a former member.

---

## Phase 10: subscription

- RevenueCat, and a webhook writing entitlements to a `subscriptions` table.
- **Gate server side.** An entitlement checked only in the app is not a gate.
  The invite accept RPC refuses if the inviter has no entitlement.
- Lapse behaviour as decided in Phase 0. Read only. Never delete a shared
  diary because a card expired.

---

## Phase 11: memory movies

The hardest phase, and correctly the last.

- **Server side rendering.** A monthly job selects clips, ffmpeg composes,
  output lands in the private bucket. On device composition is tempting but the
  native tooling here has been unstable, and a server job gates cleanly behind
  the subscription.
- Selection: favourites first, then one entry per week, capped at 60 to 90
  seconds.
- **Music needs a licence.** Ship a small set of licensed tracks. Arbitrary
  music in a user's exportable video is a takedown waiting to happen.
- Notify when it is ready, never auto play. A month of entries assembled into a
  film is exactly the thing someone might not want sprung on them.

---

## Phase 12: launch readiness

- Export and delete, both complete, both including storage objects.
- **A DPIA is likely required.** Inferring emotional patterns from someone's
  diary is arguably special category data under UK GDPR Article 9. The
  `ai_consented_at` column is the right instinct and probably the lawful basis,
  but get the assessment written. This is the legal risk in the product, not
  the security model, which is already better than most.
- App Store privacy labels, age rating, and a data retention statement.

---

## Crisis policy

Someone will record an entry about wanting to die. The app must not answer that
with a generated question the next morning.

Minimum: the Edge Function screens context before generating, and on a match it
emits nothing rather than something. A static signposting card appears in the
app, written once, with real UK numbers, and it does not analyse, score or log
the person. No streak of concern, no risk flag on a profile row. Silence plus a
number is the correct behaviour and the defensible one.

---

## Sequence at a glance

| Phase | What                        | Blocks     |
| ----- | --------------------------- | ---------- |
| 0     | Decisions                   | Everything |
| 1     | Auth                        | 2 onward   |
| 2     | Entries to Postgres         | 5 onward   |
| 3     | Voice, photo, mood, threads | 5, 7       |
| 4     | Transcription, dev build    | 5, 6, 10   |
| 5     | The assistant               | 7          |
| 6     | Resurfacing, notifications  | 8          |
| 7     | Timeline, dashboard         |            |
| 8     | Future Me                   |            |
| 9     | Sharing                     | 10         |
| 10    | Subscription                | 11         |
| 11    | Memory movies               |            |
| 12    | Launch readiness            |            |

Phases 1 to 5 are the product. 6 to 8 turn it into an archive. 9 to 11 are the
business. Anything demoable to Isabella comes out of Phase 5.
