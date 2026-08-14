-- ═══════════════════════════════════════════════════════════════
-- feed_items.url_hash — the column the sweep has always written and the
-- database has never had.
-- ═══════════════════════════════════════════════════════════════
--
-- WHAT HAPPENED. `schema.sql` declares `url_hash` and a unique constraint on
-- (user_id, url_hash). The live table has neither. The table was created from
-- an earlier schema.sql, and `create table if not exists` is a NO-OP on an
-- existing table — so every column added to the file afterwards was never
-- applied. Checklist rule 1, from the direction it was not written for: the
-- rule warns that re-running must be SAFE, and the cost of that safety is that
-- re-running also does nothing.
--
-- The observable result: ten consecutive sweeps, zero rows, and no
-- `feed-sweep` key in `agents:runs` at all. Every sweep fetched fine and died
-- at the store with "Could not find the 'url_hash' column of 'feed_items' in
-- the schema cache".
--
-- IDEMPOTENT (rule 1). Safe to run twice.
-- The table is empty, so there is no backfill — but the constraint is added
-- the same way it would need to be if there were rows, because a migration
-- that only works on an empty table is a migration nobody can re-run.

-- ── 1. The column ──
alter table feed_items add column if not exists url_hash text;

-- ── 2. The unique constraint the upsert's onConflict depends on ──
--
-- `upsert(..., { onConflict: 'user_id,url_hash' })` REQUIRES a matching unique
-- index. Without it Postgres raises "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" — a different error from
-- the missing column, and the next one the sweep would have hit.
--
-- Drop-then-add rather than `if not exists`: Postgres has no
-- `add constraint if not exists`, and a half-applied earlier attempt must be
-- repairable rather than fatal.
alter table feed_items drop constraint if exists feed_items_user_url_key;
alter table feed_items
  add constraint feed_items_user_url_key unique (user_id, url_hash);

-- ── 3. The index the dedupe lookup reads ──
-- The sweep filters on (user_id, url_hash, cached_at) every run. The unique
-- constraint above covers the first two; this covers the recency bound.
create index if not exists feed_items_cached_idx on feed_items(cached_at desc);
