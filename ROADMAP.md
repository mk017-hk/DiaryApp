# Diary: build plan

From the current repo state to the product described in the concept notes: an
emotional archive of your life, not a journal.

Phases are ordered by dependency, not by appeal. Everything in the concept
except resurfacing is blocked on Phase 1 and Phase 2.

---

## Where the repo actually is

**Built.** Design system with contrast tests. Full Postgres schema with Row
Level Security and a two user isolation suite. App lock with PIN, biometrics and
a privacy cover. Onboarding, Today, calendar, compose with all four capture
formats, entry detail, thread screen, security screen. Entry, thread, emotion
and media sync. The assistant's context rules and consent. On This Day
resurfacing, with every way of switching it off.

**Not built.** Transcription. The assistant's model call. Future Me. Sharing UI.
Billing. Notifications. The dashboard half of Phase 7. Memory movies.

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
will speak through already exists. And profile persistence, switched off while
onboarding was being shaped, is back on: the app remembers you between
launches, and signing out is what clears it.

Phases 1 and 2 are done. Authentication, the `(public)` screens, the session
gate and account deletion; then entry sync, conflict resolution and media
upload — see each phase below for what changed along the way. The device is
still the authority for reads, which was always the intention rather than a
staging post.

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

## Phase 1: authentication ✅ done

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

### What was built, and what changed on the way

Auth repository at `src/services/supabase/auth.ts`, `SessionProvider`, the four
`app/(public)/` screens, an account screen with sign out and deletion, and the
`delete-account` Edge Function. 40 integration tests, 143 unit tests.

Four decisions differ from the plan above, each for a reason:

1. **Onboarding runs before sign-up, not after.** The plan implied credentials
   first. But onboarding is where the app asks your name, and asking again on a
   sign-up form two screens later is how an app tells you it is not paying
   attention. So sign-up already knows who you are, and the name goes to the
   `handle_new_user` trigger as user metadata.
2. **The lock stayed the outermost gate**, with auth as a redirect inside the
   navigator rather than a wrapper above it. Entries live on this device
   whether or not a session is valid, so the device gate has to come first. The
   principle the plan cared about — that the two answer different questions and
   stay separate — is unchanged.
3. **The Edge Function has no imports.** The Supabase SDK could not be resolved
   from the local edge runtime, and rewriting it as plain `fetch` against the
   same REST, Storage and Auth Admin endpoints turned out to be the better
   design anyway: no module graph to resolve on a cold start.
4. **The web session goes to `localStorage`.** `expo-secure-store` is
   native-only, so on web every session write failed and was swallowed — the
   app signed you in and forgot by the next reload. Web is a preview target
   only; on iOS this is still the keychain.

Two bugs surfaced that were not visible before this phase:

- `createClient` throws on an empty URL, and it runs at import time. Any build
  without `.env.local` would have crashed on launch the moment anything
  imported the client. Unconfigured builds now get a placeholder URL and a
  fetch that refuses, so the guard failing is loud rather than a timeout.
- The deletion suite passed against a deliberately broken function that read a
  user id from the request body — because the test never sent a body. Found by
  mutating the function and watching the tests stay green. The test now
  attempts the attack for real, and goes red without the fix.

Still open from the plan: Apple sign-in is wired but cannot be verified until
there is a development build, and `handle_new_user` firing for the Apple path
is unconfirmed for the same reason. The trigger is on `auth.users` rather than
on any provider path, so it should fire — but should is not tested.

---

## Phase 2: entries into Postgres ✅ done

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

### What was built, and what changed on the way

`src/services/supabase/entries.ts` and `media.ts` as repositories, a sync
engine in `src/features/entries/sync.ts` with the remote injected, a
`SyncProvider` driving it on sign-in, foreground and after writes, and a
migration for the conflict trigger. 185 unit tests, 62 integration tests.

The done criterion is met, and tested twice: at the SQL level in
`supabase/tests/entrySync.test.ts`, and through the real application in a
browser — two contexts as two devices, one signs up and writes, the other signs
in and sees it, deletes it, and it disappears from the first.

**The schema needed a change that was not in this plan.** `set_updated_at`
stamped `now()` on every write, which makes "last write wins on `body` if
`updated_at` is respected" impossible to honour: the last device to _reconnect_
would win rather than the last to _write_. Entries now have their own trigger
that takes a client-supplied timestamp at its word and discards a stale one,
returning the winning row so the losing device finds out in the same round trip.

**Emotions are still not synced.** `entry_emotions` is a join table and nothing
in the app sets emotions yet — the picker is Phase 3. Writing sync for a field
no UI produces would be untested code pretending to be a feature, so the local
shape carries `emotions` and the join table waits for the screen that fills it.

Three bugs the tests caught, all mutation-checked:

- Conflict resolution originally also asked whether the local row was still
  queued, which let a pull undo an edit pushed seconds earlier — the pull bound
  overlaps deliberately. It compares time alone now.
- Adopting a remote row wiped `videoUri` and `posterUri`. The server has no
  opinion about where a file sits on a particular phone, so the device that
  recorded the video would have been the one to lose it.
- The account-deletion suite from Phase 1 passed against a function that read a
  user id from the request body, because the test never sent one. Fixed there;
  the lesson applied here.

**Not verified.** The upload itself streams off disk through a native module,
so it needs a real device — the storage contract around it is tested against
the real bucket, but `file.upload()` executing on a phone is not. Same standing
as Sign in with Apple: correct as written, unproven until there is a build.

---

## Phase 3: the rest of capture ✅ done

**Done:** mood and emotion selection at capture (with `entry_emotions` sync),
thread assignment at capture, a thread screen and private threads, and then
photos and voice notes — the four formats the concept promised.

Adding the last two meant changing the shape rather than adding two fields. An
entry carried one video across four columns, which cannot hold two photos and a
voice note; it is now `media: EntryMedia[]`, which is the shape `entry_media`
has had in Postgres since the first migration. The device was the half that
disagreed.

Two things worth remembering from it. Entries written by an older build are
migrated on read, keyed on the entry id, because that is what the old bucket
path used — any other id would make an uploaded video look unsent and send it
again under a new name. And captures are moved out of the cache directory,
which iOS empties when storage runs low, into the document directory, named by
media id so a retried upload overwrites instead of duplicating.

A schema bug surfaced here: `on delete set null` on the composite thread key
nulled `diary_id` too, which is NOT NULL, so deleting a thread with entries in
it failed outright. Fixed with a column list on SET NULL.

A second gap surfaced from `expo-doctor` rather than from a test: no config
plugins and so no iOS usage strings. iOS does not refuse a microphone call
without one, it kills the app, and Expo Go carries its own — so this would have
first appeared in the first real build, on the first tap of Record. The strings
are now written out in `app.config.ts`, with background recording and
background playback both off.

### Original plan

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

## Phase 5: the assistant — server side done

**Done:** `assistant_context` and `assistant_allowed` in SQL with every
exclusion rule; the `assistant` Edge Function reading as the caller rather than
the service role; the copy-rule filter; consent at onboarding and in Settings;
`ai_excluded` at capture; the `/support` screen; the Today surface with
`based_on_entry_ids` openable.

**Not done:** the model call itself has never run — there is no provider key in
local development, and the function deliberately reports how much context it
assembled and stops there. Everything up to that line is tested. Thread
follow-up as a distinct surface is also not built; the context function already
reaches back through open threads, so it is a prompt and a screen rather than
new plumbing.

Two bugs found by driving the real app in a browser and then reading the
profile row straight out of Postgres:

- Consent given at onboarding was silently lost. Onboarding runs before
  sign-up, so `set_assistant_consent` updated the row matching `auth.uid()` —
  and with no session, matched nothing. The answer is now held on the device
  and delivered once an account exists.
- Because `ai_enabled` defaults to true, the Settings screen said "On" while
  `assistant_allowed()` was returning false the whole time. A toggle that lies
  about whether something reads your diary is worse than no toggle. It now
  reports both halves.

### Original plan

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

## Phase 6: resurfacing and notifications — the mutes are done

**Done: the control that matters.** Resurfacing can now be switched off at
three grains, because they are three different requests: this entry, this
story, these dates. All three are enforced twice — in `resurfacing_candidates`
in SQL, because the scheduled job that will send the notification is not the
app, and again on the device, because the device is what actually draws the
card.

The date range is the one a per-entry flag cannot express, and the reason is the
whole point: the entries it protects against have not been written yet. Someone
muting the week around a due date is muting next August, and every August after
it. So a mute is stored as a month and a day at each end rather than as dates —
storing dates would mean it expiring quietly before the morning it was set up
for, a bug whose only symptom is the thing it exists to prevent. Ranges may wrap
the new year.

Where they are offered matters as much as that they exist. "Not this" sits on
the memory card itself, because the moment somebody finds out they did not want
a memory is the moment it is in front of them; a control for it that lived only
in settings would mean the first time it was needed was also the one time it was
too late. Capture offers both quiet options side by side, the entry screen
offers it after the fact, the thread screen can mute a whole story, and
Quiet dates is one tap from the account screen rather than buried.

A mute changes what the app puts in front of you and nothing else. Everything
written is still there, and still reachable by going to look for it.

**Not done, and blocked:** `expo-notifications` for the morning question and
for a resurfaced memory needs a development build, so it moves with Phase 4.
Defaulting notifications to off, or to one gentle prompt at a chosen time, goes
with it.

**Deliberately not done:** moving On This Day to a server query. The device is
the authority for reads in this app, and resurfacing is drawn on launch, often
with no connection. `journal_entries_on_this_day_idx` still earns its place —
the scheduled notification job will read through `resurfacing_candidates`, which
is what the index is for.

---

## Phase 7: emotional timeline — the timeline is done

**Done: the Patterns screen.** Mood over time as a shape rather than a number,
filterable by thread, every point tappable through to the entry it came from.
The words she chose most, weighted by how often rather than printed with counts
beside them. And the days themselves as texture — one mark per day, no numbers,
no run lengths, the same decision the calendar already makes by using a small
dot instead of shading a cell.

What the screen refuses to be is the thing it would most easily become. No
average, no score for a month, no streak, no count of entries, no mention of a
gap. Each of those is one line of obvious code away, which is exactly why there
are tests asserting their absence rather than a comment asking for it — the way
this promise gets broken is not a bug, it is somebody later adding something
helpful. Somebody who stopped writing for three weeks in February had a reason,
and the app is not owed it.

It shows and does not conclude. Reading a shape is hers to do, and it is the one
thing the assistant is explicitly forbidden from doing.

**Changed on the way: no RPC.** The plan called for aggregating server side, on
the grounds that pulling a year of entries to the client defeats the storage
model. That reasoning belongs to a product where the server is the authority for
reads, and this one is the other way round — the entries are already on the
device. A round trip would buy nothing and cost the one thing this screen should
never need, which is a connection.

**Not done:** the dashboard half. Recurring themes are meant to come from
`ai_messages`, which stays empty until the assistant's model call runs, and most
mentioned people and places come from `people` and `location_label`, which
nothing writes yet. Both are blocked on other work rather than on this screen.
It reaches Patterns from the calendar rather than a third tab: two destinations
is a deliberate decision, and a row of icons would make this an app for managing
things rather than a place to keep them.

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
