-- Signup wiring and private media storage.

-- ---------------------------------------------------------------------------
-- New user: profile + personal diary
-- ---------------------------------------------------------------------------

-- Runs as definer because it writes rows for a user who does not yet have a
-- session, before any policy could permit it.
create function handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  new_diary_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  );

  insert into public.diaries (owner_id, kind, title)
  values (new.id, 'personal', 'My diary')
  returning id into new_diary_id;

  insert into public.diary_members (diary_id, user_id, role)
  values (new_diary_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Private bucket. `public => false` means there is no unauthenticated URL for
-- any object: reads go through short-lived signed URLs minted per request.
--
-- The size cap is a backstop against a client that skips compression. Video is
-- compressed to 720p before upload, where two minutes is roughly 38 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'entry-media',
  'entry-media',
  false,
  209715200, -- 200 MB
  array[
    'image/jpeg', 'image/png', 'image/heic', 'image/webp',
    'video/mp4', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/x-m4a'
  ]
);

-- Object paths are '{diary_id}/{entry_id}/{uuid}.{ext}', so the first path
-- segment is the diary and membership decides access — the same rule as the
-- tables, through the same helper. When sharing ships, media follows without
-- another policy change.
create policy entry_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'entry-media'
    and is_diary_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  );

create policy entry_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'entry-media'
    and is_diary_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  );

create policy entry_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'entry-media'
    and is_diary_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  );

create policy entry_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'entry-media'
    and is_diary_member(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Emotion reference data
-- ---------------------------------------------------------------------------

-- Grouped into families for the picker and for trends. Families carry colour,
-- not judgement: no emotion here is a "bad" one to feel.
insert into emotions (slug, label, family, sort_order) values
  ('happy',       'Happy',       'warm',       10),
  ('loved',       'Loved',       'warm',       20),
  ('grateful',    'Grateful',    'warm',       30),
  ('excited',     'Excited',     'warm',       40),
  ('calm',        'Calm',        'calm',       50),
  ('peaceful',    'Peaceful',    'calm',       60),
  ('confident',   'Confident',   'calm',       70),
  ('nostalgic',   'Nostalgic',   'reflective', 80),
  ('sad',         'Sad',         'heavy',      90),
  ('lonely',      'Lonely',      'heavy',     100),
  ('overwhelmed', 'Overwhelmed', 'restless',  110),
  ('anxious',     'Anxious',     'restless',  120),
  ('angry',       'Angry',       'restless',  130);
