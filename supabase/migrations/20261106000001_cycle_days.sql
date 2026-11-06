-- ===========================================================================
-- Cycle days
-- ===========================================================================
--
-- One row per person per day: whether it was a period day, and what was
-- logged about it. The most sensitive table in the schema after the diary
-- itself, and deliberately the simplest in its rules.
--
-- Keyed by the person, not by a diary. A diary can be shared; a cycle never
-- is. Hanging these rows off a diary would put them one membership row away
-- from somebody else, and the only safe distance from that is none. So there
-- is no diary_id, no member policy, no definer helper — the owner and nobody
-- else, enforced by the simplest predicate Postgres has.
--
-- Not read by the assistant. `assistant_context` reads journal entries only,
-- and nothing here is joined into it.
--
-- Vocabularies are checked here as well as in the app. A row that says
-- `flow = 'gushing'` is a client bug or a forged request, and either way it
-- should fail loudly rather than become something a chart has to cope with.

create table cycle_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  log_date date not null,
  period boolean not null default false,
  flow text check (flow in ('spotting', 'light', 'medium', 'heavy')),
  symptoms text[] not null default '{}' check (
    symptoms <@ array[
      'none', 'cramps', 'tender-breasts', 'headache', 'bloating', 'backache', 'acne',
      'fatigue', 'cravings', 'insomnia', 'nausea', 'gut'
    ]::text[]
  ),
  -- Emotion slugs, the same vocabulary entries use. Checked by shape rather
  -- than against `emotions`, which can grow without a migration here.
  moods text[] not null default '{}' check (
    cardinality(moods) <= 20 and array_to_string(moods, ',') ~ '^[a-z-]*(,[a-z-]+)*$'
  ),
  energy text check (energy in ('drained', 'low', 'steady', 'high')),
  sleep_hours numeric(3, 1) check (sleep_hours >= 0 and sleep_hours <= 24),
  water smallint check (water >= 0 and water <= 50),
  intimacy text[] not null default '{}' check (
    intimacy <@ array['none', 'protected', 'unprotected', 'high-drive', 'low-drive']::text[]
  ),
  discharge text check (discharge in ('none', 'sticky', 'creamy', 'watery', 'egg-white', 'unusual')),
  pill text check (pill in ('taken', 'missed')),

  -- When it was logged, on the phone that logged it. Last write wins by this.
  updated_at timestamptz not null,
  -- When the account accepted it. What a pull's watermark is measured in —
  -- never `updated_at`, which a phone that was offline for a week can send
  -- long after another phone has pulled past it.
  synced_at timestamptz not null default now(),

  primary key (user_id, log_date)
);

create index cycle_days_sync_idx on cycle_days (user_id, synced_at);

-- ---------------------------------------------------------------------------
-- Last write wins, by when it was logged
-- ---------------------------------------------------------------------------

create function cycle_days_accept() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    -- Stale. Keep what we have; RETURNING hands the winner back.
    return old;
  end if;
  new.synced_at = now();
  return new;
end;
$$;

create trigger cycle_days_accept before insert or update on cycle_days
  for each row execute function cycle_days_accept();

-- ---------------------------------------------------------------------------
-- The owner, and nobody else
-- ---------------------------------------------------------------------------

alter table cycle_days enable row level security;

create policy cycle_days_select_own on cycle_days
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy cycle_days_insert_own on cycle_days
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy cycle_days_update_own on cycle_days
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cycle_days_delete_own on cycle_days
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nothing for anon. Nothing for a diary member. No grant to service code
-- beyond what Supabase gives service_role by default, which bypasses RLS and
-- is never in the app.
revoke all on cycle_days from anon;
