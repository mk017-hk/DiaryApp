-- Future Me: a letter you write now and cannot read until the day you chose.
--
-- The whole feature is one property, and it is a security property rather than
-- a product one: between writing and the unlock date, nobody can read the body.
-- Not another member of the diary, not a stolen session token, and — the part
-- that is easy to get wrong — not the author either.
--
-- A policy that returns the row and lets the client hide it is theatre. So the
-- select policy carries the date, and before it the row does not come back at
-- all. `select *` as the author, with a valid token, in a REPL, returns nothing.
-- That is the only version of this worth shipping: anything softer means the
-- promise is "the app will not show you", which is not what sealed means.
--
-- Two consequences fall out of taking that seriously.
--
-- First, this is the one thing in the app that is not local-first. Everything
-- else is written to the device and pushed afterwards, because capture must
-- never wait on a connection. A sealed letter cannot work that way: a body
-- sitting in AsyncStorage is readable by anyone holding the phone, and the seal
-- would be a lie told by the UI. So the device keeps the body only until the
-- push succeeds, then drops it and holds the metadata alone.
--
-- Second, there is no "open it early". It would be one call, and it would make
-- the feature pointless. Destroying a letter unread is allowed instead — that
-- is the escape hatch that does not break the seal, and it is the honest one:
-- she can always change her mind about having written it, just not about when
-- to read it.

create table future_messages (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,

  body text check (char_length(body) <= 100000),

  -- The morning it opens. A date rather than a timestamp: somebody choosing
  -- "a year today" means the day, and an hours-off timezone argument is not
  -- something to have with a person about their own letter.
  unlock_on date not null,

  -- When it was first read. Set by `open_future_message` rather than by the
  -- client, so it records a fact instead of a claim.
  unlocked_at timestamptz,

  -- When the notification went out, for the scheduled job to avoid sending
  -- twice. Nothing reads it yet; notifications need a development build.
  delivered_at timestamptz,

  created_at timestamptz not null default now(),

  -- Far enough ahead to be a letter to the future rather than a note for
  -- tonight. Checked here so it holds whatever writes the row.
  constraint future_messages_not_immediate check (unlock_on > created_at::date)
);

comment on table future_messages is
  'Letters to your future self. Sealed in the database, not by the client: the select policy carries unlock_on <= current_date, so before that day the row does not come back to anyone, the author included.';

create index future_messages_unlock_idx on future_messages (diary_id, unlock_on);

-- For the scheduled job that will send the notification, once there is a build
-- that can receive one.
create index future_messages_delivery_idx
  on future_messages (unlock_on)
  where delivered_at is null;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table future_messages enable row level security;

-- The seal itself. Everything else in this file is arrangement around this one
-- clause.
create policy future_messages_select_unlocked on future_messages
  for select to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and unlock_on <= current_date
  );

create policy future_messages_insert_member on future_messages
  for insert to authenticated
  with check (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  );

-- Carrying the same date clause as the select policy, and that is the whole of
-- why it is safe. `update ... returning body` is a read, so an update policy
-- without the date would be a hole straight through the seal — `using` here
-- can only ever match a row that was already readable.
--
-- The clause is load-bearing in a second way that the test suite cannot reach,
-- so it is written down here instead. PostgREST always sends a filter, and a
-- filtered UPDATE has SELECT policies applied to it, so through the API the
-- seal would hold even without this clause. An unfiltered `update
-- future_messages set body = '...'` is a different matter: it references no
-- existing row, no SELECT policy applies, and with the date removed it silently
-- overwrites every sealed letter in the diary. Checked by hand against the
-- local stack, one row overwritten without the clause and none with it. That is
-- an integrity attack rather than a confidentiality one — nobody reads anything
-- — but a letter quietly replaced before it opens is arguably worse than one
-- read early.
create policy future_messages_update_unlocked on future_messages
  for update to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and unlock_on <= current_date
  )
  with check (is_diary_member(diary_id, (select auth.uid())));

-- Deleting an opened letter, the ordinary way. A sealed one cannot go through
-- here, and not because of this policy: Postgres applies SELECT policies to any
-- UPDATE or DELETE whose WHERE clause references the row, so `delete where id =
-- ...` on a sealed letter matches nothing at all. Destroying one unread needs
-- `destroy_future_message` below.
create policy future_messages_delete_author on future_messages
  for delete to authenticated
  using (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Knowing it is there without being able to read it
-- ---------------------------------------------------------------------------

-- A sealed letter has to be visible as a fact, or the feature is a void: the
-- point is partly in knowing something is waiting. This returns that fact and
-- nothing else.
--
-- SECURITY DEFINER, which in this file needs justifying rather than merely
-- declaring. The select policy above is what makes the seal real, so this
-- function has to step around it to see sealed rows at all — and the moment it
-- does, the membership check becomes its own responsibility rather than RLS's.
-- It is therefore written to be boring: the membership test is the first thing
-- in the where clause, the column list is fixed and contains no body, and
-- there is no parameter that could widen either. `has_body` is a boolean, not
-- a length, because a character count of a letter is a small leak of its
-- contents and there is no reason to publish one.
create function sealed_letters()
  returns table (
    id uuid,
    diary_id uuid,
    unlock_on date,
    created_at timestamptz,
    has_body boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    m.id,
    m.diary_id,
    m.unlock_on,
    m.created_at,
    m.body is not null and m.body <> ''
  from public.future_messages m
  where public.is_diary_member(m.diary_id, (select auth.uid()))
    and m.unlock_on > current_date
  order by m.unlock_on
$$;

comment on function sealed_letters is
  'The letters still sealed, as facts rather than contents: when each opens, and whether it has a body. Never the body itself, and never a length — a character count is a small leak of what a letter says.';

revoke all on function sealed_letters() from public;
grant execute on function sealed_letters() to authenticated;

-- ---------------------------------------------------------------------------
-- Opening one
-- ---------------------------------------------------------------------------

-- Reading an unlocked letter and recording that it was read, in one step.
--
-- SECURITY INVOKER: this one does not need to step around anything. The select
-- policy already allows an unlocked row, so RLS does the work and the date
-- clause below is belt and braces rather than the seal.
--
-- `unlocked_at` is set here rather than by the client because it should record
-- that the letter was read, not that an app claimed it was.
create function open_future_message(message_id uuid)
  returns table (
    id uuid,
    body text,
    unlock_on date,
    created_at timestamptz,
    unlocked_at timestamptz
  )
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  -- Not named `found`: plpgsql already has a special variable by that name,
  -- and shadowing it would make the existence check below silently wrong.
  letter public.future_messages%rowtype;
begin
  select * into letter
  from public.future_messages m
  where m.id = message_id and m.unlock_on <= current_date;

  -- Sealed, deleted, or somebody else's. All three are the same answer, and
  -- distinguishing them in an error message would itself say something.
  if not found then
    return;
  end if;

  -- First read only. Re-reading a letter does not change the day it was
  -- opened, and the device may well ask again after a reinstall.
  if letter.unlocked_at is null then
    update public.future_messages m
      set unlocked_at = now()
      where m.id = letter.id
      returning m.unlocked_at into letter.unlocked_at;
  end if;

  return query
    select letter.id, letter.body, letter.unlock_on, letter.created_at, letter.unlocked_at;
end;
$$;

comment on function open_future_message is
  'Reads an unlocked letter and records when it was first opened. SECURITY INVOKER, so a sealed row is refused by the same policy that refuses a direct select.';

revoke all on function open_future_message(uuid) from public;
grant execute on function open_future_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Changing her mind
-- ---------------------------------------------------------------------------

-- Destroying a letter without reading it.
--
-- This has to be a function rather than a plain delete, and the reason is a
-- piece of Postgres worth writing down: SELECT policies are applied to any
-- UPDATE or DELETE whose WHERE clause references the row. `delete from
-- future_messages where id = ...` therefore matches nothing while the letter is
-- sealed — the seal is doing exactly what it should, and it takes the escape
-- hatch with it.
--
-- So the escape hatch is explicit, which is better anyway. It is the one
-- operation permitted on a sealed letter, it is named after what it does, and
-- it cannot be reached by accident through an ordinary query.
--
-- SECURITY DEFINER, so it can see past the seal, and written to be boring for
-- the same reasons as `sealed_letters`: authorship and membership are checked
-- first, there is no parameter but the id, and it returns a boolean rather than
-- anything from the row. It never reads the body — not into a variable, not
-- into a return value, not into an error message.
create function destroy_future_message(message_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.future_messages m
  where m.id = message_id
    and m.author_id = (select auth.uid())
    and public.is_diary_member(m.diary_id, (select auth.uid()));

  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

comment on function destroy_future_message is
  'Destroys a letter without reading it — the one thing permitted on a sealed one. A plain delete cannot do this: Postgres applies SELECT policies to a DELETE that filters on the row, so the seal would block it.';

revoke all on function destroy_future_message(uuid) from public;
grant execute on function destroy_future_message(uuid) to authenticated;
