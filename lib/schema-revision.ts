/**
 * ═══════════════════════════════════════════════════════════════
 * WHICH REVISION OF schema.sql THIS BUILD EXPECTS TO BE APPLIED.
 * ═══════════════════════════════════════════════════════════════
 *
 * The repo's number. The database's number comes from
 * `schema_applied_through()`, created by the LAST statement in
 * supabase/schema.sql — so its presence means the file finished, and its value
 * says which version of the file finished.
 *
 * ⚠️ A BOOLEAN WOULD NOT HAVE BEEN ENOUGH. "Something completed once" cannot
 * distinguish the next partial application from a stale complete one: an
 * instance stuck three revisions back reports exactly what a current one does.
 * The number is what makes "behind" a state you can be in.
 *
 * Same mechanism as `EDGE_CONTRACT` on the edge functions, and for the same
 * reason: which version is deployed is a question about the DEPLOYMENT rather
 * than about the work, so it must be answerable without running the work.
 *
 * ══ WHEN TO BUMP ══
 *
 * When schema.sql changes in a way a live database must pick up — a new table,
 * a changed function, a new trigger. Not for a comment.
 *
 * ⚠️ AND THE TWO NUMBERS ARE ASSERTED EQUAL. tests/schema-sentinel.test.ts
 * parses the literal out of schema.sql and compares it with this constant. A
 * bump made in one place and not the other would mean the drift check reports
 * "behind" on a database that is current, which trains a reader to ignore it —
 * the same failure as an intermittent gate.
 */
export const SCHEMA_REVISION = 5;

export interface SchemaSentinel {
  /** What the database reports. Null when the sentinel function is absent. */
  applied: number | null;
  expected: number;
  state: 'current' | 'behind' | 'ahead' | 'never-completed';
  detail: string;
}

/**
 * ⚠️ `never-completed` IS ITS OWN STATE, not a synonym for `behind`.
 *
 * An absent sentinel means schema.sql has never run to completion on this
 * database — which is what was true here for six weeks while one of three
 * triggers existed and every health score was fiction. "Behind by some
 * revisions" and "stopped partway, we do not know where" call for different
 * actions: one is re-run the file, the other is find out what aborted it
 * first, because re-running will abort in the same place.
 */
export function readSentinel(applied: number | null): SchemaSentinel {
  if (applied === null) {
    return {
      applied,
      expected: SCHEMA_REVISION,
      state: 'never-completed',
      detail:
        'schema.sql has never run to completion on this database — the sentinel ' +
        'function it creates as its last statement is absent. Something aborted ' +
        'it partway. Run the inventory in ' +
        'supabase/migrations/20260823_schema_sentinel.sql to find out how far it got.',
    };
  }
  if (applied === SCHEMA_REVISION) {
    return {
      applied,
      expected: SCHEMA_REVISION,
      state: 'current',
      detail: `schema.sql revision ${applied} ran to completion.`,
    };
  }
  if (applied < SCHEMA_REVISION) {
    return {
      applied,
      expected: SCHEMA_REVISION,
      state: 'behind',
      detail:
        `The database completed revision ${applied}; this build expects ` +
        `${SCHEMA_REVISION}. Re-run supabase/schema.sql.`,
    };
  }
  return {
    applied,
    expected: SCHEMA_REVISION,
    state: 'ahead',
    /*
      Not an error, and reported rather than silently accepted: it means this
      deployment is older than the database, which is the shape of a rollback.
    */
    detail:
      `The database completed revision ${applied}, which is AHEAD of this ` +
      `build's ${SCHEMA_REVISION}. The deployment is older than the schema.`,
  };
}
