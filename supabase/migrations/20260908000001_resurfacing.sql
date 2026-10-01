-- Resurfacing, and the right to be left alone by it.
--
-- "Two years ago today" is the feature that makes this an archive rather than a
-- notebook. It is also the feature most capable of doing harm. An unrequested
-- card can land on someone on the worst morning of their year: the due date of
-- a pregnancy that ended, the anniversary of a death, the week a marriage
-- finished. The app has no way of knowing which days those are. Only she does.
--
-- So resurfacing is built with its off switches first, at three grains, because
-- the three are genuinely different requests:
--
--   * this entry      — "I wrote it, I keep it, do not hand it back to me"
--   * this story      — "stop following this one up"
--   * these dates     — "do not reach into this part of the calendar at all"
--
-- The date range is the one that matters most and the one a per-entry flag
-- cannot express, because the entries it protects against have not been written
-- yet. Someone muting the week around a due date is muting next year's August,
-- and every August after it.
--
-- All three are enforced in `resurfacing_candidates` below rather than in the
-- client, for the same reason the assistant's exclusions live in SQL: the
-- scheduled job that will eventually send the notification is not the app, and
-- a rule the client holds is a rule the notification never hears about.

-- ---------------------------------------------------------------------------
-- Per entry, and per thread
-- ---------------------------------------------------------------------------

-- Deliberately separate from `ai_excluded`. They are different sentences.
-- "Never read this" and "never bring this back to me" are both reasonable, and
-- so is either one without the other: a difficult entry can be something she
-- wants reflected on but not sprung on her, and a dull one can be fine to
-- resurface and pointless to read.
alter table journal_entries
  add column resurface_excluded boolean not null default false;

comment on column journal_entries.resurface_excluded is
  'Never show this entry as a resurfaced memory. Separate from ai_excluded: "do not read this" and "do not hand this back to me" are different requests.';

alter table threads
  add column resurface_muted boolean not null default false;

comment on column threads.resurface_muted is
  'Never resurface any entry in this thread. Separate from is_private, which hides the thread from the assistant.';

-- ---------------------------------------------------------------------------
-- Quiet dates
-- ---------------------------------------------------------------------------

-- A range of the calendar that resurfacing does not reach into, in any year.
--
-- Stored as month and day rather than full dates because that is what is being
-- asked for. "The last week of August" is not a range of two dates in 2026, it
-- is a shape in every year. Storing it as dates would mean the mute silently
-- expiring on the one morning it was set up to protect.
--
-- Both ends inclusive, and a range is allowed to wrap the new year —
-- 28 December to 3 January is one request, not two.
create table resurfacing_mutes (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,

  from_month smallint not null check (from_month between 1 and 12),
  from_day smallint not null check (from_day between 1 and 31),
  to_month smallint not null check (to_month between 1 and 12),
  to_day smallint not null check (to_day between 1 and 31),

  -- Optional, and never required. Someone should be able to mute a week
  -- without having to write down why — being made to name it is its own small
  -- cost, on exactly the subject where that cost is highest.
  label text check (char_length(label) <= 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table resurfacing_mutes is
  'Parts of the calendar resurfacing never reaches into, in any year. Stored as month/day, not dates, so a mute set for a due date does not expire before the date it protects.';

create index resurfacing_mutes_diary_idx on resurfacing_mutes (diary_id);

-- ---------------------------------------------------------------------------
-- Is today muted?
-- ---------------------------------------------------------------------------

-- Pulled out as its own function because the wrap-around case is the kind of
-- thing that looks obvious and is wrong in one direction, and it is easier to
-- test a boolean than to test it through a join.
--
-- IMMUTABLE and taking everything as arguments, so it costs nothing to call
-- once per mute row.
create function date_within_mute(
  check_month integer,
  check_day integer,
  from_month integer,
  from_day integer,
  to_month integer,
  to_day integer
)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select case
    -- An ordinary range inside one year: both ends compared as MMDD.
    when (from_month * 100 + from_day) <= (to_month * 100 + to_day)
      then (check_month * 100 + check_day)
             between (from_month * 100 + from_day) and (to_month * 100 + to_day)
    -- A range that wraps the new year is the union of its two halves.
    else (check_month * 100 + check_day) >= (from_month * 100 + from_day)
      or (check_month * 100 + check_day) <= (to_month * 100 + to_day)
  end
$$;

comment on function date_within_mute is
  'Whether a month/day falls inside a mute range. Ranges may wrap the new year: 28 December to 3 January is one request, not two.';

-- ---------------------------------------------------------------------------
-- What may be resurfaced
-- ---------------------------------------------------------------------------

-- The only place that answers "what can we show her from this day in other
-- years". SECURITY INVOKER, so RLS applies and this can never reach a diary the
-- caller is not a member of.
--
-- The rules, in order:
--   * the entry is not deleted
--   * it is from this month and day, in a year that is not this one
--   * `resurface_excluded` is not set on the entry
--   * its thread, if it has one, is not muted
--   * the day itself is not inside a quiet range
--
-- The quiet range is checked last and applies to the whole day: if the day is
-- muted, nothing comes back at all. That is deliberately blunt. A mute that
-- returned "some of it" would be a mute that still surprises her.
create function resurfacing_candidates(on_date date default current_date)
  returns table (
    entry_id uuid,
    diary_id uuid,
    entry_date date,
    years_ago integer,
    title text,
    body text,
    mood smallint,
    thread_id uuid
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    e.id,
    e.diary_id,
    e.entry_date,
    (extract(year from on_date) - extract(year from e.entry_date))::integer,
    e.title,
    e.body,
    e.mood,
    e.thread_id
  from public.journal_entries e
  left join public.threads t on t.id = e.thread_id
  where e.deleted_at is null
    and extract(month from e.entry_date) = extract(month from on_date)
    and extract(day from e.entry_date) = extract(day from on_date)
    and e.entry_date < date_trunc('year', on_date)::date
    and not e.resurface_excluded
    and coalesce(t.resurface_muted, false) = false
    and not exists (
      select 1
      from public.resurfacing_mutes m
      where m.diary_id = e.diary_id
        and public.date_within_mute(
          extract(month from on_date)::integer,
          extract(day from on_date)::integer,
          m.from_month,
          m.from_day,
          m.to_month,
          m.to_day
        )
    )
  order by e.entry_date desc
$$;

comment on function resurfacing_candidates is
  'Entries that may be shown as a memory for a given day. Applies every mute: per entry, per thread, and per quiet date range. The scheduled notification job must read through this and nothing else.';

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table resurfacing_mutes enable row level security;

-- Readable by anyone in the diary. In a shared diary a mute is a boundary the
-- other member needs to be able to see and keep, not a secret.
create policy resurfacing_mutes_select_member on resurfacing_mutes
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

create policy resurfacing_mutes_insert_member on resurfacing_mutes
  for insert to authenticated
  with check (
    is_diary_member(diary_id, (select auth.uid()))
    and created_by = (select auth.uid())
  );

create policy resurfacing_mutes_update_member on resurfacing_mutes
  for update to authenticated
  using (is_diary_member(diary_id, (select auth.uid())))
  with check (is_diary_member(diary_id, (select auth.uid())));

-- Anyone in the diary may lift a mute, including one the other member set.
-- The alternative is a mute that outlives the reason for it with nobody able
-- to remove it.
create policy resurfacing_mutes_delete_member on resurfacing_mutes
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- Same trigger entries use: the client sends the time it made the edit, and a
-- stale one is discarded rather than winning.
create trigger resurfacing_mutes_updated_at
  before update on resurfacing_mutes
  for each row
  execute function set_entry_updated_at ();
