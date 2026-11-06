-- ===========================================================================
-- Reflections: notes and suggestions on one entry, written by the assistant
-- ===========================================================================
--
-- After an entry is written or recorded and transcribed, the assistant reads
-- it — with her consent, and never the entries she has held back — and writes
-- a few lines of notes in her own terms, the subjects it touched, and up to
-- three gentle suggestions. This is where those are kept.
--
-- Readable and deletable by the entry's author and nobody else, even inside a
-- shared diary: a reflection is about one person's words, for that person.
-- Never written by a client. Only the Edge Function, as the service role, can
-- insert one, so nothing in this table can be forged and attributed to the
-- assistant — the same rule as `ai_messages`.

create table entry_reflections (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  diary_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  notes text not null check (char_length(notes) between 1 and 1200),
  themes text[] not null default '{}' check (cardinality(themes) <= 5),
  feelings text[] not null default '{}' check (cardinality(feelings) <= 5),
  -- [{ "kind": "write" | "try" | "keep", "text": "…" }], at most three.
  suggestions jsonb not null default '[]'::jsonb check (
    jsonb_typeof(suggestions) = 'array' and jsonb_array_length(suggestions) <= 3
  ),
  model text not null,
  created_at timestamptz not null default now(),

  -- One per entry. Asking again replaces it.
  unique (entry_id),
  foreign key (entry_id, diary_id) references journal_entries (id, diary_id) on delete cascade
);

create index entry_reflections_user_idx on entry_reflections (user_id, created_at desc);

alter table entry_reflections enable row level security;

create policy entry_reflections_select_own on entry_reflections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy entry_reflections_delete_own on entry_reflections
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No insert or update policy, on purpose. See above.
revoke all on entry_reflections from anon;

-- ---------------------------------------------------------------------------
-- A reflection goes when the reason for it does
-- ---------------------------------------------------------------------------

-- Entries are deleted by tombstone, so the foreign key's cascade never fires
-- for an ordinary delete. And marking an entry "keep this from the assistant"
-- after it was reflected on means she no longer wants it read — keeping the
-- assistant's notes on it would contradict that. Either way, the notes go.
create function drop_reflection_when_withdrawn() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (new.deleted_at is not null and old.deleted_at is null)
     or (new.ai_excluded and not old.ai_excluded)
     or (new.is_personal and not old.is_personal) then
    delete from public.entry_reflections where entry_id = new.id;
  end if;
  return new;
end;
$$;

create trigger journal_entries_drop_reflection after update on journal_entries
  for each row execute function drop_reflection_when_withdrawn();

-- ---------------------------------------------------------------------------
-- What the assistant may read for one reflection
-- ---------------------------------------------------------------------------

-- The same exclusions as `assistant_context`, for a single entry, and one
-- more: only its author may ask. In a shared diary somebody else can read an
-- entry, but cannot have the assistant read it on their behalf.
--
-- SECURITY INVOKER, called with the caller's own token, so RLS applies on top
-- of every rule written here.
create function reflection_source(target uuid)
  returns table (
    entry_id uuid,
    diary_id uuid,
    entry_date date,
    updated_at timestamptz,
    mood smallint,
    thread_title text,
    body text,
    transcript text,
    emotions text[]
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
    e.updated_at,
    e.mood,
    t.title,
    e.body,
    (
      select string_agg(m.transcript, E'\n\n' order by m.position)
      from public.entry_media m
      where m.entry_id = e.id and m.transcript is not null and m.transcript <> ''
    ),
    coalesce(
      (
        select array_agg(em.label order by em.sort_order)
        from public.entry_emotions ee
        join public.emotions em on em.id = ee.emotion_id
        where ee.entry_id = e.id
      ),
      '{}'
    )
  from public.journal_entries e
  left join public.threads t on t.id = e.thread_id
  where
    e.id = target
    and e.author_id = (select auth.uid())
    and public.assistant_allowed()
    and e.deleted_at is null
    and not e.ai_excluded
    and not e.is_personal
    and coalesce(t.is_private, false) = false
    and not public.thread_is_personal(e.thread_id)
$$;

comment on function reflection_source is
  'One entry the assistant may reflect on, for its author only: consent given, not deleted, not held back, not personal, not in a private or personal thread. SECURITY INVOKER.';
