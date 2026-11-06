# Going live: real people, real accounts

## What already exists

The account system is built. Nothing in this document is code.

- **Sign-up, sign-in, sign-out, password reset, account deletion.** Each new
  account gets its own diary from a database trigger the moment it is created.
- **Isolation.** Every table is behind Row Level Security, and the test suite
  attacks it from a second account, a third that was never a member, and a
  former member of a shared diary. One person cannot read another's diary
  through the app, the API, or a stolen token for a different account.
- **A phone that changes hands.** The device records whose diary it holds. A
  different account signing in has the previous diary wiped before anything is
  shown or synced. (Before this, the next person was shown it — and the
  previous person's unsent entries were uploaded into the new account. That was
  demonstrated against the old build, then fixed.)
- **Links in emails come back into the app.** Confirmation and password reset
  both land on `diary://auth/callback`, and a forgotten password is recoverable
  on the phone. Proven end to end against the real auth server and its real
  emails.
- **Export and deletion**, both complete, both including media and cycle
  data.
- **Cycle data kept apart.** Periods and daily logs live in their own table,
  keyed by the person rather than by a diary, readable by the owner and nobody
  else — not even somebody she shares her diary with. The assistant never
  reads it.
- **Sharing that works from both sides.** The invited person can open, read
  and add to a shared diary; anything marked _Just for me_ stays with its
  author.

What is missing is somewhere for it to run. Today it runs against a Supabase
stack inside a development container. Real accounts need a hosted project.

---

## What you need, and what it costs

|                             | Why                                                                              | Cost                                       |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| **Supabase project**        | The database, auth and storage                                                   | Free to start; Pro for real people (below) |
| **A domain name**           | Email will not deliver without one, and the App Store needs a privacy policy URL | About £10 a year                           |
| **An email provider**       | Supabase's built-in sender is for testing only                                   | Free tier is plenty to start               |
| **Apple Developer account** | A real build on a phone — see BUILDING.md                                        | £79 a year                                 |

### Free or Pro

Free is fine for you and a few testers. It is not fine for anyone keeping a
real diary in it, for two reasons that matter more here than in most apps:

- **Free projects pause after a week with no activity.** A paused project means
  nobody can sign in or sync until you unpause it by hand.
- **Free has no backups.** One bad migration and everybody's diary is gone.

Pro (about $25 a month at the time of writing) has daily backups and does not
pause. Check supabase.com/pricing for the current limits — storage especially,
because video is large.

**Run two projects:** a free one for development and testing, and the real one
for real people. You will want to try things on something that is not
somebody's diary, and the development project is also the only place
`exp://` links should ever be allowed (see step 3).

---

## 1. Create the project

At supabase.com, create a project.

- **Region: London (`eu-west-2`).** Diary entries about health, relationships
  and grief are arguably special category data under UK GDPR. Keeping them in
  the UK is the simplest position to defend.
- **Save the database password** somewhere safe. The CLI asks for it.

## 2. Put the schema and functions in it

From the repository, with the project's reference (the `xxxx` in
`xxxx.supabase.co`):

```bash
npx supabase login
npx supabase link --project-ref xxxx

# Every migration: tables, policies, functions, the storage bucket, and the
# emotion vocabulary. The project starts empty; this is all of it.
npx supabase db push

# Account deletion (required by the App Store) and the assistant.
npx supabase functions deploy delete-account
npx supabase functions deploy assistant
```

The functions receive `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` automatically. The assistant also wants a model
key, which can wait — until it is set the assistant assembles its context and
stops short of calling a model:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

**Do not run `supabase config push`.** It copies `supabase/config.toml` to the
hosted project, and that file is deliberately set up for local development:
confirmations off, a localhost site URL. Every setting below is made in the
dashboard instead.

## 3. Auth settings, in the dashboard

The dashboard is reorganised from time to time, so names may have shifted
slightly. What each setting does will not have.

**Authentication → Sign In / Providers → Email**

- **Confirm email: on.** Locally it is off so tests can sign up instantly. In
  production it is what stops somebody creating an account with your email
  address.
- **Minimum password length: 8.** The app asks for eight; the server should
  enforce the same, or a modified client could set a shorter one.

**Authentication → URL Configuration**

- **Redirect URLs:** `diary://**`
  This is the setting most likely to be missed and the one with the least
  obvious symptom. A redirect not on this list is _silently_ replaced with the
  site URL — no error — and the email link opens a web page instead of the
  app. The local test suite proves both halves of that.
- **Site URL:** a page on your domain (`https://yourdomain.com`). It is only a
  fallback, but it should be somewhere you control.

On the **development** project only, also add `exp://**` so links work in Expo
Go. Keep it off the real project: it would let a reset link be redirected to
any machine running Expo Go.

## 4. Email that actually arrives

Supabase's built-in sender is for trying things out. It is heavily rate-limited
and, on current projects, only delivers to members of your own Supabase
organisation — so a stranger signing up never gets their confirmation email.

1. **Get a domain**, if you do not have one.
2. **Sign up with an email provider** — Resend, Postmark and Amazon SES all
   work. Verify your domain with them; this means adding a few DNS records
   they give you, and it is what stops your emails going to spam.
3. **Authentication → Emails → SMTP Settings:** enable custom SMTP and paste
   in the provider's host, port, username and password. Sender: something like
   `diary@yourdomain.com`.
4. **Authentication → Rate Limits:** check the emails-per-hour limit is
   sensible once custom SMTP is on.

The default email templates work as they are — the app handles the links they
contain. Rewording them in the app's voice is worth doing before launch, not
necessary before testing.

## 5. Point the app at it

From **Project Settings → API Keys**, take the project URL and the **anon** (or
**publishable**) key. Either key works. The **service_role** / **secret** key
must never go anywhere near the app — it bypasses every policy in the database.

**For Expo Go**, in `.env.local` (gitignored):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

then restart with the cache cleared — Metro will otherwise keep serving the
previous configuration:

```bash
npx expo start --tunnel --clear
```

**For EAS builds**, once per environment (`eas.json` names which environment
each build profile reads):

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL \
  --value https://xxxx.supabase.co --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value eyJ... --visibility plaintext
```

Repeat with `--environment production` for the real project. These are
`plaintext` on purpose: anything starting `EXPO_PUBLIC_` is compiled into the
app and readable by anyone who has it. That is fine for these two. It is why
nothing secret may ever be given that prefix.

## 6. Test it with two accounts on one phone

Before inviting anyone. Each of these is something a real person will do in
the first week.

1. Sign up with a real email address. The confirmation email arrives, and its
   link opens the app signed in.
2. Write an entry. Sign out. Sign back in. The entry is there.
3. Sign out, tap **Forgot password**, follow the email. The app opens on
   _Choose a new password_; the new one works and the old one does not.
4. Somebody else signing in on a phone that still holds A's diary. A's session
   has to end _without_ Sign out, which would wipe the phone anyway: delete A
   in the dashboard (Authentication → Users) while the phone is signed in as
   A. The app notices when its session next refreshes — up to an hour, since
   the token it holds stays valid until then — and returns to the welcome
   screen. Sign in as B there. B sees an empty diary, and nothing of A's
   appears in B's account.
5. Sign in as A on a second phone. On the first, reset A's password through
   **Forgot password**. The second phone is signed out when its session next
   refreshes (again, up to an hour) — and when A signs back in there, the
   diary is still on it. (Resetting is the only way to change a password in
   the app today; there is no change-password setting yet.)
6. Delete account B from the Account screen. Sign-in with B's details fails,
   and B's files are gone from Storage in the dashboard.
7. Turn on cycle tracking as A and mark a period. In the dashboard's Table
   Editor, `cycle_days` shows A's rows. Share A's diary with a new account C:
   C can read the diary on the Sharing screen and sees nothing of A's cycle
   anywhere.

Email links need either a real build (`diary://`) or Expo Go pointed at the
**development** project with `exp://**` allowed.

## 7. Before anyone who is not you

- **A privacy policy at a URL on your domain.** The App Store requires one, and
  for this app it needs to say plainly: what is stored, where (London), who can
  read it (nobody but the account holder, and the assistant only with consent),
  and how to export and delete it — all of which the app already does.
- **A DPIA.** Cycle data is health data — special category under UK GDPR
  Article 9 without any argument — and inferring emotional patterns from
  someone's diary arguably is too. The consent the app records
  is probably the lawful basis, but have the assessment written down. This is
  the legal risk in the product, not the security model.
- **Backups confirmed** — on Pro, check the dashboard shows them.

---

## Later, not now

- **Universal Links instead of `diary://`.** iOS lets any app register any
  custom URL scheme, so a malicious app could in principle claim `diary://` and
  receive a reset link meant for this one. PKCE blunts this for links the app
  itself asked for, but not for a reset someone else requested on the user's
  behalf. Universal Links tie `https://yourdomain.com/...` to this app alone.
  They need the domain from step 4 and the Apple Developer account, so they
  belong with the first real build.
- **Sign in with Apple.** The app's half is built (`src/features/auth/
appleSignIn.ts`) and hidden until it can work. The other half is enabling the
  Apple provider in the dashboard, which needs the Apple Developer account. It
  also only runs in a real build, not Expo Go.
- **A change-password setting** for someone who knows their password and wants
  a new one. Today the reset flow is the only route.
- **Shorter access tokens.** A session that has been revoked — by a password
  reset, or an account deleted elsewhere — keeps working until its access
  token expires, an hour by default, because the token is checked by
  signature rather than looked up. Lowering the expiry (fifteen minutes is
  common) shortens that window at the cost of more frequent refreshes. For an
  app whose reset screen exists partly for people who fear someone else has
  their password, it is worth doing.
- **Leaked-password protection** (Pro): refuses passwords known from breaches.
  Worth turning on.
