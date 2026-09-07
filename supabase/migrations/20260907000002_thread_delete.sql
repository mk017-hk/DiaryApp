-- Making a thread deletable.

-- ---------------------------------------------------------------------------
-- The composite foreign key nulled a column that cannot be null
-- ---------------------------------------------------------------------------

-- `journal_entries_thread_same_diary` is a composite key on (thread_id,
-- diary_id), which is what stops an entry in one diary pointing at a thread in
-- another. It carried a plain `on delete set null`, and a plain SET NULL nulls
-- *every* column in the key — including diary_id, which is NOT NULL.
--
-- So deleting a thread that had any entries in it raised:
--
--   null value in column "diary_id" of relation "journal_entries"
--   violates not-null constraint
--
-- The delete simply failed. Not silently wrong — wrong in the other direction:
-- a thread with entries could not be removed at all, and the user would have
-- got an unexplained error for an ordinary action.
--
-- Postgres 15 added a column list on SET NULL, which is exactly the fix: null
-- the thread, keep the diary. The entry survives its container losing its
-- name, which is the behaviour that was always intended — the writing is the
-- point, and a thread is only a way of grouping it.
alter table journal_entries
  drop constraint journal_entries_thread_same_diary;

alter table journal_entries
  add constraint journal_entries_thread_same_diary
    foreign key (thread_id, diary_id) references threads (id, diary_id)
    on delete set null (thread_id);
