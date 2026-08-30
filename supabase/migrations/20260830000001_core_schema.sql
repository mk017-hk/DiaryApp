-- Core schema.
--
-- Entries live inside a *diary*, and diaries have members. A solo user simply
-- has one personal diary, created on signup and invisible in the UI. A shared
-- diary is the same table with a second member. Modelling the container now
-- means adding sharing later is a feature, not a migration of every entry and
-- a rewrite of every policy.
--
-- Threads are named ongoing stories within a diary ("trying again"). They are
-- what gives the assistant something to follow up on across days, and what
-- turns a list of entries into an archive.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

create type diary_kind as enum ('personal', 'shared');
create type diary_role as enum ('owner', 'member');
create type thread_status as enum ('open', 'closed');
create type media_kind as enum ('photo', 'video', 'audio');
create type media_status as enum ('pending', 'uploaded', 'failed');
create type transcript_status as enum ('none', 'pending', 'done', 'failed');
create type ai_message_kind as enum ('question', 'observation');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  avatar_path text,
  timezone text not null default 'UTC',
  onboarding_completed_at timestamptz,

  -- The assistant reads transcript text. Consent is recorded explicitly rather
  -- than assumed, and can be withdrawn by clearing ai_enabled.
  ai_enabled boolean not null default true,
  ai_consented_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- diaries and membership
-- ---------------------------------------------------------------------------

create table diaries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My diary' check (char_length(title) between 1 and 120),
  kind diary_kind not null default 'personal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index diaries_owner_idx on diaries (owner_id);

create table diary_members (
  diary_id uuid not null references diaries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role diary_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (diary_id, user_id)
);

create index diary_members_user_idx on diary_members (user_id);

-- ---------------------------------------------------------------------------
-- threads
-- ---------------------------------------------------------------------------

create table threads (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  status thread_status not null default 'open',

  -- A private thread is excluded from the assistant entirely. Enforced
  -- server-side when assembling AI context, never by the client.
  is_private boolean not null default false,

  started_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Lets child rows carry diary_id and prove it matches via a composite FK.
  unique (id, diary_id)
);

create index threads_diary_idx on threads (diary_id, status, started_on desc);

-- ---------------------------------------------------------------------------
-- journal_entries
-- ---------------------------------------------------------------------------

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  thread_id uuid,
  author_id uuid not null references auth.users (id) on delete cascade,

  title text check (char_length(title) <= 200),

  -- The editable note. Starts as a copy of the transcript for a video entry,
  -- then belongs to the user — transcription mishears names and places, and
  -- correcting your own diary must not destroy the record of what was said.
  body text check (char_length(body) <= 100000),

  -- entry_date is the day the moment belongs to and drives the calendar and
  -- On This Day; entry_at is the precise instant. Keeping the date as a `date`
  -- allows the immutable expression index used for date-based resurfacing.
  entry_date date not null default current_date,
  entry_at timestamptz not null default now(),

  mood smallint check (mood between 1 and 5),
  is_favourite boolean not null default false,

  -- Excludes this single entry from the assistant, independently of its thread.
  ai_excluded boolean not null default false,

  location_label text check (char_length(location_label) <= 200),
  people text[],

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, diary_id),

  -- A thread must belong to the same diary as the entry. Enforced by the
  -- database so a forged thread_id cannot smuggle an entry across diaries.
  constraint journal_entries_thread_same_diary
    foreign key (thread_id, diary_id) references threads (id, diary_id) on delete set null
);

create index journal_entries_diary_date_idx
  on journal_entries (diary_id, entry_date desc)
  where deleted_at is null;

create index journal_entries_thread_idx
  on journal_entries (thread_id, entry_date desc)
  where deleted_at is null and thread_id is not null;

create index journal_entries_favourite_idx
  on journal_entries (diary_id, entry_date desc)
  where deleted_at is null and is_favourite;

-- On This Day. extract() over a `date` is immutable, so it can be indexed;
-- to_char() is only stable and would be rejected here.
create index journal_entries_on_this_day_idx
  on journal_entries (
    diary_id,
    (extract(month from entry_date)),
    (extract(day from entry_date))
  )
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- entry_media
-- ---------------------------------------------------------------------------

create table entry_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  diary_id uuid not null,

  kind media_kind not null,

  -- '{diary_id}/{entry_id}/{uuid}.{ext}' in a private bucket. Never a URL:
  -- access is always through a short-lived signed URL minted on demand.
  storage_path text not null unique,
  poster_path text,

  mime_type text not null,
  size_bytes bigint check (size_bytes >= 0),
  duration_ms integer check (duration_ms >= 0),
  width integer check (width > 0),
  height integer check (height > 0),

  -- What was actually said. Written once by on-device transcription and then
  -- left alone; the user's edits live on journal_entries.body instead.
  transcript text,
  transcript_status transcript_status not null default 'none',

  status media_status not null default 'pending',
  position integer not null default 0,
  created_at timestamptz not null default now(),

  constraint entry_media_entry_same_diary
    foreign key (entry_id, diary_id) references journal_entries (id, diary_id) on delete cascade
);

create index entry_media_entry_idx on entry_media (entry_id, position);
create index entry_media_diary_idx on entry_media (diary_id);

-- Reconciliation of abandoned uploads.
create index entry_media_pending_idx
  on entry_media (created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- emotions, tags
-- ---------------------------------------------------------------------------

create table emotions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  family text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table entry_emotions (
  entry_id uuid not null,
  diary_id uuid not null,
  emotion_id uuid not null references emotions (id) on delete cascade,
  primary key (entry_id, emotion_id),
  constraint entry_emotions_entry_same_diary
    foreign key (entry_id, diary_id) references journal_entries (id, diary_id) on delete cascade
);

create index entry_emotions_diary_idx on entry_emotions (diary_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, diary_id)
);

create unique index tags_diary_name_idx on tags (diary_id, lower(name));

create table entry_tags (
  entry_id uuid not null,
  tag_id uuid not null,
  diary_id uuid not null,
  primary key (entry_id, tag_id),
  constraint entry_tags_entry_same_diary
    foreign key (entry_id, diary_id) references journal_entries (id, diary_id) on delete cascade,
  constraint entry_tags_tag_same_diary
    foreign key (tag_id, diary_id) references tags (id, diary_id) on delete cascade
);

create index entry_tags_diary_idx on entry_tags (diary_id);

-- ---------------------------------------------------------------------------
-- ai_messages
-- ---------------------------------------------------------------------------

-- What the assistant asked or observed, and what it drew on. Stops it
-- repeating itself, and means a user can see exactly what it has been doing.
create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind ai_message_kind not null,
  content text not null check (char_length(content) <= 4000),
  based_on_entry_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index ai_messages_diary_idx on ai_messages (diary_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger diaries_updated_at before update on diaries
  for each row execute function set_updated_at();
create trigger threads_updated_at before update on threads
  for each row execute function set_updated_at();
create trigger journal_entries_updated_at before update on journal_entries
  for each row execute function set_updated_at();
