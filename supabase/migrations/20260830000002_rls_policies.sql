-- Row Level Security.
--
-- Every table below is deny-by-default: RLS is enabled and nothing is readable
-- or writable except through an explicit policy. The database, not the client,
-- decides who can see a diary entry.
--
-- Access is membership-based rather than `user_id = auth.uid()`, because an
-- entry in a shared diary is legitimately visible to more than one person.
-- That is a larger attack surface than direct ownership and is covered by the
-- two-user isolation suite in supabase/tests/.

-- ---------------------------------------------------------------------------
-- Membership helper
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER is load-bearing, not decoration.
--
-- A policy on diary_members that itself selects from diary_members recurses
-- until the connection dies. Running the lookup as the definer bypasses RLS
-- inside the function, which breaks the cycle. Every policy in this file goes
-- through it, including the storage policies.
--
-- search_path is pinned to empty so the function cannot be hijacked by a
-- caller-controlled schema shadowing `public`.
create function is_diary_member(d uuid, u uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.diary_members m
    where m.diary_id = d and m.user_id = u
  );
$$;

revoke all on function is_diary_member(uuid, uuid) from public;
grant execute on function is_diary_member(uuid, uuid) to authenticated;

create function is_diary_owner(d uuid, u uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.diary_members m
    where m.diary_id = d and m.user_id = u and m.role = 'owner'
  );
$$;

revoke all on function is_diary_owner(uuid, uuid) from public;
grant execute on function is_diary_owner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles — strictly your own
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update_own on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Insert is handled by the handle_new_user trigger, not by clients.
-- Delete happens via auth.users cascade.

-- ---------------------------------------------------------------------------
-- diaries
-- ---------------------------------------------------------------------------

alter table diaries enable row level security;

create policy diaries_select_member on diaries
  for select to authenticated
  using (is_diary_member(id, (select auth.uid())));

create policy diaries_insert_own on diaries
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy diaries_update_owner on diaries
  for update to authenticated
  using (is_diary_owner(id, (select auth.uid())))
  with check (owner_id = (select auth.uid()));

create policy diaries_delete_owner on diaries
  for delete to authenticated
  using (is_diary_owner(id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- diary_members
-- ---------------------------------------------------------------------------

alter table diary_members enable row level security;

create policy diary_members_select_member on diary_members
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- Only an owner adds members. Without this a user could insert themselves into
-- any diary whose id they guessed and read everything in it — the single most
-- dangerous write in the schema.
create policy diary_members_insert_owner on diary_members
  for insert to authenticated
  with check (is_diary_owner(diary_id, (select auth.uid())));

create policy diary_members_delete_owner_or_self on diary_members
  for delete to authenticated
  using (
    is_diary_owner(diary_id, (select auth.uid()))
    or user_id = (select auth.uid())   -- leaving a shared diary
  );

-- ---------------------------------------------------------------------------
-- threads
-- ---------------------------------------------------------------------------

alter table threads enable row level security;

create policy threads_select_member on threads
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

create policy threads_insert_member on threads
  for insert to authenticated
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy threads_update_member on threads
  for update to authenticated
  using (is_diary_member(diary_id, (select auth.uid())))
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy threads_delete_member on threads
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- journal_entries
-- ---------------------------------------------------------------------------

alter table journal_entries enable row level security;

create policy journal_entries_select_member on journal_entries
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- author_id is asserted as the caller so an entry cannot be attributed to
-- someone else inside a shared diary.
create policy journal_entries_insert_member on journal_entries
  for insert to authenticated
  with check (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  );

create policy journal_entries_update_member on journal_entries
  for update to authenticated
  using (is_diary_member(diary_id, (select auth.uid())))
  with check (
    is_diary_member(diary_id, (select auth.uid()))
    and author_id = (select auth.uid())
  );

create policy journal_entries_delete_member on journal_entries
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- entry_media
-- ---------------------------------------------------------------------------

alter table entry_media enable row level security;

create policy entry_media_select_member on entry_media
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

create policy entry_media_insert_member on entry_media
  for insert to authenticated
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy entry_media_update_member on entry_media
  for update to authenticated
  using (is_diary_member(diary_id, (select auth.uid())))
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy entry_media_delete_member on entry_media
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- emotions — global reference data, readable, never writable by users
-- ---------------------------------------------------------------------------

alter table emotions enable row level security;

create policy emotions_select_all on emotions
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- entry_emotions, tags, entry_tags
-- ---------------------------------------------------------------------------

alter table entry_emotions enable row level security;

create policy entry_emotions_select_member on entry_emotions
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

create policy entry_emotions_insert_member on entry_emotions
  for insert to authenticated
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy entry_emotions_delete_member on entry_emotions
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

alter table tags enable row level security;

create policy tags_select_member on tags
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

create policy tags_insert_member on tags
  for insert to authenticated
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy tags_update_member on tags
  for update to authenticated
  using (is_diary_member(diary_id, (select auth.uid())))
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy tags_delete_member on tags
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

alter table entry_tags enable row level security;

create policy entry_tags_select_member on entry_tags
  for select to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

create policy entry_tags_insert_member on entry_tags
  for insert to authenticated
  with check (is_diary_member(diary_id, (select auth.uid())));

create policy entry_tags_delete_member on entry_tags
  for delete to authenticated
  using (is_diary_member(diary_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- ai_messages
-- ---------------------------------------------------------------------------

alter table ai_messages enable row level security;

create policy ai_messages_select_own on ai_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and is_diary_member(diary_id, (select auth.uid()))
  );

-- Only the assistant Edge Function writes these, using the service role, which
-- bypasses RLS. Clients may dismiss a message but never author one.
create policy ai_messages_update_own on ai_messages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
