-- Consent in a shared diary.
--
-- `assistant_context` has always been gated on `assistant_allowed()`, which
-- asks whether *the caller* has consented to the assistant reading their diary.
-- That was the whole of the question while every diary had exactly one member.
--
-- The moment a diary has two, it is the wrong question. Alice consents, Bob
-- does not, they share a diary — and Alice's morning question is assembled from
-- Bob's entries, because the only consent anybody checked was hers. Nothing in
-- the previous migration is wrong; it was written for a world that this
-- schema's own sharing feature has just ended.
--
-- Consent belongs to the person who wrote the words, not to the person asking
-- the question about them.

-- Whether a particular author has consented, asked past RLS.
--
-- SECURITY DEFINER, because `profiles` is readable only by its owner — and
-- correctly so, since it holds somebody's name and their consent record. A
-- SECURITY INVOKER version would return false for every other member, which
-- happens to fail closed and happens to be right for the wrong reason: it would
-- be reading "I cannot see Bob's profile" as "Bob said no". The day somebody
-- makes profiles readable by fellow members, that accident reverses silently.
--
-- It returns a boolean about one user's consent and nothing else. It cannot be
-- used to read a profile, only to ask the single question the context function
-- needs answered.
create function assistant_allowed_for(author uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = author
      and p.ai_enabled
      and p.ai_consented_at is not null
  )
$$;

comment on function assistant_allowed_for is
  'Whether the author of an entry has consented to the assistant reading it. Asked of the author rather than of the caller, because in a shared diary those are different people.';

revoke all on function assistant_allowed_for(uuid) from public;
grant execute on function assistant_allowed_for(uuid) to authenticated;

-- The context function, with both halves of consent.
--
-- `assistant_allowed()` still gates the whole thing: somebody who has not
-- consented gets no assistant at all, including over their own writing. What is
-- new is the per-entry check, which keeps a non-consenting member's words out
-- of a consenting member's prompt.
create or replace function assistant_context(
  window_days integer default 14,
  max_entries integer default 60
)
  returns table (
    entry_id uuid,
    diary_id uuid,
    entry_date date,
    mood smallint,
    thread_id uuid,
    thread_title text,
    body text,
    transcript text
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
    e.mood,
    e.thread_id,
    t.title,
    e.body,
    (
      select m.transcript from public.entry_media m
      where m.entry_id = e.id and m.transcript is not null
      order by m.position
      limit 1
    )
  from public.journal_entries e
  left join public.threads t on t.id = e.thread_id
  where
    public.assistant_allowed()
    -- Asked of whoever wrote it. In a personal diary this is the same person
    -- and the same answer; in a shared one it is the entire point.
    and public.assistant_allowed_for(e.author_id)
    and e.deleted_at is null
    and not e.ai_excluded
    and coalesce(t.is_private, false) = false
    -- A personal entry is nobody else's context either. RLS already hides it
    -- from another member, so this is belt and braces — but the assistant is
    -- the one caller for whom a mistake here means words appearing in a prompt
    -- rather than merely on a screen.
    and not e.is_personal
    and not public.thread_is_personal(e.thread_id)
    and (
      e.entry_date >= (current_date - make_interval(days => greatest(window_days, 0)))
      or t.status = 'open'
    )
  order by e.entry_at desc
  limit least(greatest(max_entries, 0), 200)
$$;

comment on function assistant_context is
  'Entries the assistant may read. Excludes private and personal threads, ai_excluded and personal entries, and anything written by somebody who has not consented — asked of the author, not of the caller. SECURITY INVOKER, so RLS confines it to the caller''s own diaries.';
