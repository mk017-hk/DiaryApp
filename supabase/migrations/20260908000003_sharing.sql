-- Shared diaries.
--
-- The schema was built for this from the first migration: entries live in a
-- diary, diaries have members, and every policy already asks `is_diary_member`.
-- So this adds no column to `journal_entries` for sharing itself. What it adds
-- is the way in, and the way to keep part of a shared diary to yourself.
--
-- Two decisions carry the weight here.
--
-- The first is that **the client never inserts into `diary_members`**. That row
-- is the single most dangerous write in the schema: anyone who can add
-- themselves to a diary can read everything in it, forever, and nothing else in
-- the design would notice. So joining happens through one SECURITY DEFINER
-- function that checks an invite and nothing else, and the existing
-- owner-only insert policy stays exactly as it is.
--
-- The second is that **an invite code is stored hashed**. A table of live
-- invite codes is a table of keys to other people's diaries; if it is ever read
-- — a backup, a support query, a leak — hashed codes are useless and plaintext
-- ones are not. The code exists in the clear exactly once, in the response to
-- the person who created it.

-- ---------------------------------------------------------------------------
-- Keeping part of a shared diary to yourself
-- ---------------------------------------------------------------------------

-- Two people sharing a record of something hard still need a page the other
-- cannot read. Without this, sharing is all-or-nothing, and the only way to
-- keep one difficult entry private is to not write it — which is the outcome
-- this app exists to prevent.
--
-- Deliberately decided now rather than after launch, because retrofitting it
-- means rewriting the policy every other policy is modelled on.
alter table journal_entries
  add column is_personal boolean not null default false;

comment on column journal_entries.is_personal is
  'Readable only by its author, even inside a shared diary. Enforced by the select policy, not by the client.';

-- Threads need the same, and need an author before they can have one: a thread
-- is created by somebody, and until now nothing recorded who.
alter table threads
  add column created_by uuid references auth.users (id) on delete set null;

alter table threads
  add column is_personal boolean not null default false;

comment on column threads.is_personal is
  'A whole story only its author can read, inside a shared diary. Separate from is_private, which hides a thread from the assistant, and from resurface_muted, which stops it being handed back.';

-- Existing threads predate sharing and belong to a personal diary, so their
-- author is that diary's owner. Backfilled rather than left null so the
-- policies below have something to compare against.
update threads t
  set created_by = d.owner_id
  from diaries d
  where d.id = t.diary_id and t.created_by is null;

create index threads_author_idx on threads (created_by);

-- ---------------------------------------------------------------------------
-- The policies that make it real
-- ---------------------------------------------------------------------------

-- Whether a thread is personal, asked without going through the policies on
-- `threads`.
--
-- SECURITY DEFINER, and the reason is a trap worth naming because it is
-- invisible until something tests for it. A policy that subqueries another
-- table reads that table through the *caller's* policies. Written as a plain
-- `not exists (select 1 from threads ...)`, the entry policy asks "can I see a
-- personal thread with this id" — and the thread policy has just finished
-- hiding exactly that row from exactly this person. The subquery finds nothing,
-- `not exists` is true, and every entry in the thread she most wanted to keep
-- to herself is readable by the other member.
--
-- Caught by a test, which is the only way it was ever going to be caught: the
-- policy reads correctly, the thread is correctly hidden, and the hole is in
-- the interaction. It is the same reason `is_diary_member` is SECURITY DEFINER.
create function thread_is_personal(t uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.threads where id = t and is_personal
  )
$$;

comment on function thread_is_personal is
  'Whether a thread is personal, read past RLS. A policy subquerying threads directly would see them through the caller''s own policies, which is to say it would not see the hidden one it is asking about.';

revoke all on function thread_is_personal(uuid) from public;
grant execute on function thread_is_personal(uuid) to authenticated;

-- An entry is visible to a member of its diary unless it is personal, or sits
-- in a personal thread, in which case only its author sees it.
--
-- The thread check happens in the policy rather than by making the client stamp
-- `is_personal` on every entry it files into a personal thread — that is a rule
-- the client would eventually forget on one code path, and the cost of
-- forgetting it is somebody's worst week shown to the person they were keeping
-- it from.
drop policy journal_entries_select_member on journal_entries;

create policy journal_entries_select_member on journal_entries
  for select to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and (
      author_id = (select auth.uid())
      or (not is_personal and not thread_is_personal(thread_id))
    )
  );

-- Only the author edits or deletes their own entry. Previously any member
-- could, which was harmless while every diary had one member and is not the
-- moment a second one exists.
drop policy journal_entries_update_member on journal_entries;

create policy journal_entries_update_author on journal_entries
  for update to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  )
  with check (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  );

drop policy journal_entries_delete_member on journal_entries;

create policy journal_entries_delete_author on journal_entries
  for delete to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  );

-- A personal thread is invisible to the other member, which also hides the fact
-- that it exists — the title of a thread can say as much as the entries in it.
drop policy threads_select_member on threads;

create policy threads_select_member on threads
  for select to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and (not is_personal or created_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

create table diary_invites (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,

  -- Never the code. See the note at the top: a table of live codes is a table
  -- of keys to other people's diaries.
  code_hash text not null unique,

  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table diary_invites is
  'Single-use invitations to join a diary. Codes are stored hashed and appear in the clear exactly once, in the response to whoever created them.';

create index diary_invites_diary_idx on diary_invites (diary_id, created_at desc);

alter table diary_invites enable row level security;

-- Readable by members, so an owner can see what is outstanding. The hash is in
-- the row and that is fine — it is a hash.
create policy diary_invites_select_member on diary_invites
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- No insert policy: invites are created by `create_diary_invite` alone, so
-- there is no path on which a code is stored without one being generated.
--
-- Revoking is an update, restricted to the owner.
create policy diary_invites_update_owner on diary_invites
  for update to authenticated
  using (is_diary_owner(diary_id, (select auth.uid())))
  with check (is_diary_owner(diary_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Making one
-- ---------------------------------------------------------------------------

-- The code is generated here rather than by the client for two reasons: a
-- client-chosen code is as guessable as the client is careful, and the hash has
-- to be of something the server knows is random.
--
-- Twelve characters from an alphabet of 32 is about sixty bits, which is well
-- past guessing, and the alphabet leaves out the characters people mistype
-- reading one out loud.
create function create_diary_invite(target_diary uuid, valid_days integer default 7)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
begin
  if not public.is_diary_owner(target_diary, (select auth.uid())) then
    raise exception 'Only the owner of a diary can invite someone to it'
      using errcode = '42501';
  end if;

  if valid_days < 1 or valid_days > 30 then
    raise exception 'An invite lasts between a day and a month'
      using errcode = '22023';
  end if;

  for i in 1..12 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;

  insert into public.diary_invites (diary_id, invited_by, code_hash, expires_at)
  values (
    target_diary,
    (select auth.uid()),
    encode(extensions.digest(code, 'sha256'), 'hex'),
    now() + make_interval(days => valid_days)
  );

  -- The only time the code exists in the clear.
  return code;
end;
$$;

comment on function create_diary_invite is
  'Creates a single-use invite and returns the code once. Only the code hash is stored.';

revoke all on function create_diary_invite(uuid, integer) from public;
grant execute on function create_diary_invite(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Using one
-- ---------------------------------------------------------------------------

-- The only path to a `diary_members` row for somebody who is not already an
-- owner, and therefore the most security-sensitive function in the schema.
--
-- Everything it refuses is listed in one place so that none of it depends on a
-- caller having checked first:
--   * a code that matches nothing
--   * an invite already used, revoked, or past its date
--   * the person who sent it, accepting their own
--   * somebody already in the diary
--
-- Every refusal gives the same message. Distinguishing "no such code" from
-- "that code expired" would turn this into an oracle for which codes exist.
create function accept_diary_invite(code text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  invite public.diary_invites%rowtype;
  joiner uuid := (select auth.uid());
begin
  if joiner is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into invite
  from public.diary_invites i
  where i.code_hash = encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex')
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now();

  if not found then
    raise exception 'That invitation is not valid' using errcode = '22023';
  end if;

  if invite.invited_by = joiner then
    raise exception 'That invitation is not valid' using errcode = '22023';
  end if;

  if public.is_diary_member(invite.diary_id, joiner) then
    raise exception 'That invitation is not valid' using errcode = '22023';
  end if;

  insert into public.diary_members (diary_id, user_id, role)
  values (invite.diary_id, joiner, 'member');

  update public.diary_invites i
    set accepted_at = now(), accepted_by = joiner
    where i.id = invite.id;

  -- A diary with two people in it is a shared diary, whatever it started as.
  update public.diaries d
    set kind = 'shared'
    where d.id = invite.diary_id;

  return invite.diary_id;
end;
$$;

comment on function accept_diary_invite is
  'The only path to a diary_members row for a non-owner. Every refusal returns the same message so it cannot be used to discover which codes exist.';

revoke all on function accept_diary_invite(text) from public;
grant execute on function accept_diary_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Leaving
-- ---------------------------------------------------------------------------

-- Leaving removes access and destroys nothing. Entries keep their author and
-- stay in the diary they were written in — a shared record of a year is not
-- something one person takes away with them, and deleting on the way out would
-- let somebody erase half of a couple's archive from their own phone.
--
-- An owner cannot leave. They would leave a diary nobody can administer; the
-- owner's route out is deleting the diary or their account, both of which say
-- plainly what they do.
create function leave_diary(target_diary uuid)
  returns boolean
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  removed integer;
begin
  if public.is_diary_owner(target_diary, (select auth.uid())) then
    raise exception 'The owner of a diary cannot leave it' using errcode = '42501';
  end if;

  delete from public.diary_members m
  where m.diary_id = target_diary and m.user_id = (select auth.uid());

  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

comment on function leave_diary is
  'Removes the caller from a shared diary. Entries stay where they were written, with their author.';

revoke all on function leave_diary(uuid) from public;
grant execute on function leave_diary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Who else is here
-- ---------------------------------------------------------------------------

-- A shared diary needs to be able to say who is in it, and `profiles` is only
-- readable by its owner — correctly, since it holds somebody's name and their
-- consent record. This returns the two fields a member list needs and nothing
-- else.
create function diary_members_with_names(target_diary uuid)
  returns table (user_id uuid, display_name text, role diary_role, joined_at timestamptz)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.user_id, p.display_name, m.role, m.joined_at
  from public.diary_members m
  left join public.profiles p on p.id = m.user_id
  where public.is_diary_member(target_diary, (select auth.uid()))
    and m.diary_id = target_diary
  order by m.joined_at
$$;

comment on function diary_members_with_names is
  'Who is in a diary, for a member of it. Returns a display name and nothing else from profiles.';

revoke all on function diary_members_with_names(uuid) from public;
grant execute on function diary_members_with_names(uuid) to authenticated;
