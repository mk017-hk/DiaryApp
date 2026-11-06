-- ===========================================================================
-- Pulling by when the account accepted a change, not when it was made
-- ===========================================================================
--
-- The pull used to measure its watermark in `updated_at`, which the phone sets
-- to when the edit was made. That is the right clock for deciding which of two
-- edits wins, and the wrong one for deciding what a device has already seen.
--
-- The failure, reproduced in supabase/tests/entrySync.test.ts: a tablet pulls
-- at noon. A phone that was offline all morning comes back and sends an entry
-- written at nine. Its `updated_at` is three hours behind the tablet's
-- watermark, so the tablet never pulls it — not next time, not ever.
--
-- `synced_at` is set by the database whenever it accepts a write, so it only
-- ever moves forward, and anything newly accepted is after every watermark
-- handed out before it.

alter table journal_entries add column synced_at timestamptz not null default now();

create index journal_entries_synced_idx on journal_entries (diary_id, synced_at);

-- The same rule as before for which edit wins, plus the stamp on the way in.
-- A stale edit returns the old row unchanged, stamp included: nothing moved.
create or replace function set_entry_updated_at() returns trigger
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
    new.synced_at = now();
    return new;
  end if;

  new.updated_at = now();
  new.synced_at = now();
  return new;
end;
$$;

-- Inserts are stamped by the column default; a client cannot backdate one.
create function stamp_entry_synced_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.synced_at = now();
  return new;
end;
$$;

create trigger journal_entries_synced_at before insert on journal_entries
  for each row execute function stamp_entry_synced_at();
