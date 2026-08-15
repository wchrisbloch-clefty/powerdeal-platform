/**
 * ═══════════════════════════════════════════════════════════════
 * SCHEMA DRIFT — the one gap no test in this repo can see.
 * ═══════════════════════════════════════════════════════════════
 *
 * `schema.sql` declared `feed_items.url_hash` and a unique constraint on
 * (user_id, url_hash). The live table had neither. The table was created from
 * an earlier version of that file, and `create table if not exists` is a NO-OP
 * on an existing table — so every column added afterwards was declared and
 * never applied.
 *
 * The sweep wrote `url_hash` on every run for the entire life of the feature.
 * Ten consecutive failures, zero rows, and no `feed-sweep` key in `agents:runs`
 * at all. The suite was green throughout, and correctly so: it compared code
 * against `schema.sql`, and those two agreed. It was the DATABASE that
 * disagreed, and no test here can reach the database.
 *
 * THE APP CAN. It runs with service-role access, so the check belongs at
 * runtime, not in the suite. This module reads `information_schema` and
 * `pg_constraint` and compares them against the manifest parsed out of
 * `schema.sql`.
 *
 * BOTH DIRECTIONS, ALWAYS:
 *   · DECLARED-BUT-ABSENT — the failure that happened. Code assumes a column
 *     the database does not have, and every write dies at the same line.
 *   · PRESENT-BUT-UNDECLARED — a column added by hand in the SQL editor and
 *     never written down. Harmless today, and the reason the next `schema.sql`
 *     run produces a table nobody recognises.
 *
 * NON-GATING. Drift is reported, never enforced. It must not block a deploy, a
 * request, a deal from progressing or an artifact from generating. A schema
 * checker that can refuse traffic is a bigger outage than the drift it watches.
 *
 * PURE. `parseSchemaManifest` takes text and returns structure — the reading of
 * `schema.sql` and the querying of Postgres both happen in the caller. That
 * split is what lets the suite exercise the comparison exhaustively without a
 * database, and it keeps this file honest about what it can prove.
 */

export interface TableManifest {
  table: string;
  columns: string[];
  /** Unique constraints, each as its ordered column list. */
  unique: string[][];
  indexes: string[];
}

/**
 * What `schema_snapshot()` returns.
 *
 * `unique_constraints` are comma-joined column lists, not nested arrays —
 * `unique` is a reserved word and Postgres multidimensional arrays must be
 * rectangular, which constraint lists are not. The pre-joined signature is
 * what the comparison reduces to anyway.
 */
export interface LiveTable {
  table_name: string;
  columns: string[];
  unique_constraints: string[];
  indexes: string[];
}

export type DriftKind =
  | 'missing-table'
  | 'missing-column'
  | 'extra-column'
  | 'missing-unique'
  | 'extra-unique'
  | 'missing-index';

export interface Drift {
  kind: DriftKind;
  table: string;
  /** Column, constraint signature or index name. */
  detail: string;
  /**
   * `blocking` — code writes this and the database lacks it. Something is
   *              failing right now, or will the moment that path runs.
   * `notice`   — the database has something the manifest does not. Nothing is
   *              broken; the record is incomplete.
   */
  severity: 'blocking' | 'notice';
  why: string;
}

/**
 * Parse `schema.sql` into the manifest it declares.
 *
 * Deliberately narrow: `create table`, inline `constraint … unique (…)`, and
 * `create index`. It does not attempt to be a SQL parser — anything it cannot
 * read it omits, and an omission produces no drift rather than a false one. A
 * checker that invents findings gets muted, and a muted checker is worse than
 * none because it reads as coverage.
 */
export function parseSchemaManifest(sql: string): TableManifest[] {
  const out: TableManifest[] = [];
  const tableRe = /create table if not exists\s+(\w+)\s*\(([\s\S]*?)\n\);/gi;

  for (const match of sql.matchAll(tableRe)) {
    const table = match[1];
    const body = match[2];
    const columns: string[] = [];
    const unique: string[][] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim();
      if (!line) continue;

      /**
       * ⚠️ POSTGRES HAS THREE WAYS TO SPELL A UNIQUE CONSTRAINT AND THIS
       * PARSER READ ONE OF THEM.
       *
       * It matched only the NAMED table-level form. `schema.sql` also uses the
       * anonymous table-level form (`unique(user_id, key)` on `app_state`) and
       * the column-level form (`user_id uuid references … unique` on
       * `user_settings`) — so both were reported as `extra-unique`: "the
       * database enforces uniqueness that schema.sql does not declare."
       *
       * SCHEMA.SQL DECLARED THEM BOTH. The file was right, the database was
       * right, and the checker could not read two of the three syntaxes.
       *
       * That is the worse failure direction for this module. A checker that
       * invents findings gets muted, and a muted checker reads as coverage —
       * which is the sentence already at the top of this file. Two false
       * notices out of twenty-four is exactly how that starts.
       *
       * The fix is here, NOT in schema.sql. Rewriting the schema to a syntax
       * the parser happens to understand is editing the thing being measured
       * to satisfy the measurement.
       */
      const namedConstraint = /^constraint\s+\w+\s+unique\s*\(([^)]+)\)/i.exec(line);
      if (namedConstraint) {
        unique.push(namedConstraint[1].split(',').map((c) => c.trim()));
        continue;
      }

      // Anonymous table-level: `unique(user_id, key)` / `unique (a, b)`
      const anonConstraint = /^unique\s*\(([^)]+)\)/i.exec(line);
      if (anonConstraint) {
        unique.push(anonConstraint[1].split(',').map((c) => c.trim()));
        continue;
      }

      if (/^(constraint|primary key|unique|check|foreign key)\b/i.test(line)) continue;

      const col = /^([a-z_][a-z0-9_]*)\s+/i.exec(line);
      if (col) {
        columns.push(col[1]);
        // Column-level: `user_id uuid references auth.users(id) … unique,`
        //
        // Matched on the line AFTER the column name is taken, and anchored on
        // a word boundary so a column literally named `unique_key` or a
        // comment containing the word does not manufacture a constraint. A
        // false unique here would report the database as MISSING one, which
        // sends someone to write a migration for a constraint that should not
        // exist.
        const withoutComment = line.replace(/--.*$/, '');
        if (/\bunique\b/i.test(withoutComment) && !/^unique\b/i.test(withoutComment)) {
          unique.push([col[1]]);
        }
      }
    }

    out.push({ table, columns, unique, indexes: [] });
  }

  const indexRe = /create index if not exists\s+(\w+)\s+on\s+(\w+)/gi;
  for (const match of sql.matchAll(indexRe)) {
    const entry = out.find((t) => t.table === match[2]);
    if (entry) entry.indexes.push(match[1]);
  }

  return out;
}

const sig = (cols: string[]) => [...cols].sort().join(',');

/**
 * Compare the manifest against what the database actually has.
 *
 * Tables the manifest declares and the database lacks are reported once as
 * `missing-table` and NOT expanded into a column-by-column list — twenty
 * findings for one cause is a report nobody reads to the end.
 */
export function compareSchema(
  manifest: TableManifest[],
  live: LiveTable[],
): Drift[] {
  const drift: Drift[] = [];
  const byName = new Map(live.map((t) => [t.table_name, t]));

  for (const declared of manifest) {
    const actual = byName.get(declared.table);
    if (!actual) {
      drift.push({
        kind: 'missing-table',
        table: declared.table,
        detail: declared.table,
        severity: 'blocking',
        why: 'schema.sql declares this table and the database does not have it.',
      });
      continue;
    }

    const liveCols = new Set(actual.columns);
    for (const col of declared.columns) {
      if (!liveCols.has(col)) {
        drift.push({
          kind: 'missing-column',
          table: declared.table,
          detail: col,
          severity: 'blocking',
          why:
            `schema.sql declares ${declared.table}.${col} and the table does not ` +
            `have it. \`create table if not exists\` is a no-op on an existing ` +
            `table, so a column added to the file after the table was created ` +
            `never arrives. Ship a migration.`,
        });
      }
    }

    const declaredCols = new Set(declared.columns);
    for (const col of actual.columns) {
      if (!declaredCols.has(col)) {
        drift.push({
          kind: 'extra-column',
          table: declared.table,
          detail: col,
          severity: 'notice',
          why:
            `${declared.table}.${col} exists in the database and schema.sql ` +
            `does not declare it. Nothing is broken — the record is incomplete, ` +
            `and a fresh environment built from schema.sql will not have it.`,
        });
      }
    }

    const liveUnique = new Set(actual.unique_constraints.map((u) => sig(u.split(','))));
    for (const u of declared.unique) {
      if (!liveUnique.has(sig(u))) {
        drift.push({
          kind: 'missing-unique',
          table: declared.table,
          detail: u.join(', '),
          severity: 'blocking',
          why:
            `No unique constraint on (${u.join(', ')}). Any upsert with ` +
            `onConflict on those columns raises "there is no unique or ` +
            `exclusion constraint matching the ON CONFLICT specification".`,
        });
      }
    }

    const declaredUnique = new Set(declared.unique.map(sig));
    for (const raw of actual.unique_constraints) {
      const u = raw.split(',');
      if (!declaredUnique.has(sig(u))) {
        drift.push({
          kind: 'extra-unique',
          table: declared.table,
          detail: u.join(', '),
          severity: 'notice',
          why:
            `The database enforces uniqueness on (${u.join(', ')}) and ` +
            `schema.sql does not declare it. An insert can fail for a reason ` +
            `nothing in the repo explains.`,
        });
      }
    }

    const liveIdx = new Set(actual.indexes);
    for (const idx of declared.indexes) {
      if (!liveIdx.has(idx)) {
        drift.push({
          kind: 'missing-index',
          table: declared.table,
          detail: idx,
          severity: 'notice',
          why: `Index ${idx} is declared and absent. Queries still work, slower.`,
        });
      }
    }
  }

  return drift;
}

export interface DriftReport {
  ok: boolean;
  checkedTables: number;
  blocking: number;
  notices: number;
  drift: Drift[];
  /**
   * Set when the check itself could not run. NOT the same as "no drift" — a
   * checker that reports clean when it could not look is the health-surface
   * defect this build keeps finding (checklist rule 9).
   */
  error: string | null;
}

export function summarise(
  manifest: TableManifest[],
  live: LiveTable[] | null,
  error: string | null,
): DriftReport {
  if (error || !live) {
    return {
      ok: false,
      checkedTables: 0,
      blocking: 0,
      notices: 0,
      drift: [],
      error: error ?? 'Schema could not be read.',
    };
  }

  const drift = compareSchema(manifest, live);
  const blocking = drift.filter((d) => d.severity === 'blocking').length;
  return {
    ok: drift.length === 0,
    checkedTables: manifest.length,
    blocking,
    notices: drift.length - blocking,
    drift,
    error: null,
  };
}
