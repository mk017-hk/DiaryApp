-- Making journal_entries safe to write from a device that was offline.

-- ---------------------------------------------------------------------------
-- Last write wins, by when it was written rather than when it arrived
-- ---------------------------------------------------------------------------

-- `set_updated_at` stamps now() on every update, which is right for a row only
-- ever written by a connected client. Entries are not that: a phone in flight
-- mode holds edits for hours and pushes them later, and stamping arrival time
-- would make the *last to reconnect* win rather than the last to write.
--
-- Concretely, without this: A edits at 10:00 offline, B edits at 11:00 and
-- syncs, A reconnects at 12:00 and its older text overwrites B's newer one.
--
-- So entries get their own trigger. A client that supplies `updated_at` is
-- stating when the edit was made, and that is honoured. A client supplying one
-- *older* than the stored row is replaying a superseded edit: the update is
-- discarded and the stored row is returned unchanged, which tells the device
-- it lost and hands it the row that won in the same round trip.
--
-- The rule lives here, not in the client, for the usual reason — a device can
-- be wrong, out of date, or lying, and the database is the one place every
-- write has to pass through.
create function set_entry_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.updated_at is distinct from old.updated_at then
    if new.updated_at < old.updated_at then
      -- Stale. Keep what we have; RETURNING hands the winner back.
      return old;
    end if;
    -- The client dated its own edit. Take it at its word.
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger journal_entries_updated_at on journal_entries;

create trigger journal_entries_updated_at before update on journal_entries
  for each row execute function set_entry_updated_at();

-- ---------------------------------------------------------------------------
-- Pulling only what changed
-- ---------------------------------------------------------------------------

-- A sync pass asks for everything in a diary touched since it last looked,
-- deleted rows included — a tombstone is how a second device learns that
-- something was deleted, so `deleted_at is null` cannot be part of the index.
create index journal_entries_sync_idx
  on journal_entries (diary_id, updated_at);

-- ---------------------------------------------------------------------------
-- Media the app started uploading and never finished
-- ---------------------------------------------------------------------------

-- `entry_media_pending_idx` already exists for finding these. This is the
-- other half: a row stuck in 'pending' long enough that the upload which
-- created it is certainly not still running.
--
-- Deliberately a function rather than a scheduled job. What to do about an
-- abandoned upload depends on whether the device still holds the file, which
-- only the device knows, so it asks and then decides.
create function stale_pending_media(older_than interval default '1 hour')
  returns table (id uuid, entry_id uuid, diary_id uuid, storage_path text, created_at timestamptz)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select m.id, m.entry_id, m.diary_id, m.storage_path, m.created_at
  from public.entry_media m
  where m.status = 'pending'
    and m.created_at < now() - older_than
  order by m.created_at
$$;

comment on function stale_pending_media is
  'Media rows whose upload never completed. Runs as invoker, so RLS still applies and a caller only ever sees their own.';
