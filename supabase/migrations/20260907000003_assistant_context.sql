-- What the assistant is allowed to read, decided in SQL.

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------

-- Two columns already exist on profiles: `ai_enabled`, which the user can turn
-- off, and `ai_consented_at`, which records that they were asked. Both must be
-- true for any content to be assembled — a default of enabled is not consent,
-- and this is the function that says so.
create function assistant_allowed(for_user uuid default null)
  returns boolean
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = coalesce(for_user, (select auth.uid()))
      and p.ai_enabled
      and p.ai_consented_at is not null
  )
$$;

comment on function assistant_allowed is
  'Whether the assistant may read anything at all for this user. Enabled by default is not consent; ai_consented_at is the record that they were asked.';

-- ---------------------------------------------------------------------------
-- The context itself
-- ---------------------------------------------------------------------------

-- Every exclusion rule the product promises, enforced here rather than in the
-- Edge Function or the client.
--
-- The reason is not tidiness. A client that asks for a private thread's
-- contents must be refused by something it cannot argue with, and an Edge
-- Function that filtered in TypeScript would be one forgotten `where` away
-- from putting a miscarriage in a prompt. Putting it in SQL means the wrong
-- rows are not merely unused — they are never returned.
--
-- SECURITY INVOKER, deliberately. Row Level Security still applies, so this
-- can only ever see diaries the caller is a member of. The Edge Function calls
-- it with the *caller's* token rather than the service role, which means the
-- assistant literally cannot read more of someone's diary than they can.
--
-- The rules, in order:
--   * consent given and not withdrawn, or nothing at all comes back
--   * the entry is not deleted
--   * `ai_excluded` is not set on the entry
--   * the entry's thread is not private
--   * recent, OR in a thread that is still open — an arc someone is living
--     through does not stop mattering because it started five weeks ago
create function assistant_context(window_days integer default 14, max_entries integer default 60)
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
    -- The transcript of what was said, which is often the fuller record: the
    -- body may have been trimmed by hand, the transcript never is.
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
    and e.deleted_at is null
    and not e.ai_excluded
    and coalesce(t.is_private, false) = false
    and (
      e.entry_date >= (current_date - make_interval(days => greatest(window_days, 0)))
      or t.status = 'open'
    )
  order by e.entry_at desc
  limit least(greatest(max_entries, 0), 200)
$$;

comment on function assistant_context is
  'Entries the assistant may read. Excludes private threads, ai_excluded entries and everything belonging to a user who has not consented. SECURITY INVOKER, so RLS confines it to the caller''s own diaries.';

-- ---------------------------------------------------------------------------
-- Not asking the same thing twice
-- ---------------------------------------------------------------------------

-- `ai_messages.based_on_entry_ids` is the honesty feature of this app: a user
-- can always see exactly what a question was drawn from. This index is what
-- makes it cheap to ask "what have I already said to this person", so the
-- assistant can avoid repeating itself.
create index ai_messages_recent_idx
  on ai_messages (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Turning the assistant off, and on
-- ---------------------------------------------------------------------------

-- Consent is recorded at the moment it is given, and withdrawing it leaves the
-- record that it was once given — `ai_enabled` goes false, `ai_consented_at`
-- stays. Clearing both would make a second ask look like a first one.
create function set_assistant_consent(enabled boolean)
  returns void
  language sql
  volatile
  security invoker
  set search_path = ''
as $$
  update public.profiles
  set
    ai_enabled = enabled,
    ai_consented_at = case
      when enabled and ai_consented_at is null then now()
      else ai_consented_at
    end
  where id = (select auth.uid())
$$;

comment on function set_assistant_consent is
  'Records consent the first time it is given and never clears it. Withdrawing sets ai_enabled false and keeps the date, so a later ask is not mistaken for a first one.';
