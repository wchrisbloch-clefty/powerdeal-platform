import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  compareSchema, parseSchemaManifest, summarise, type LiveTable,
} from '@/lib/schema-drift';

/**
 * THE ONE GAP NO TEST HERE CAN SEE — so this tests the COMPARISON, not the
 * database.
 *
 * `schema.sql` declared `feed_items.url_hash` and the live table never had it.
 * The suite was green throughout and correctly so: it compared code against
 * schema.sql, and those agreed. The database disagreed, and nothing in the repo
 * could reach it.
 *
 * What is provable here is that the comparison would name the drift if it were
 * handed the real shapes. What is NOT provable here is that the live database
 * matches — that is the route's job, at runtime, with service-role access.
 * Saying so plainly matters more than the coverage number.
 */

const schemaSql = await readFile('supabase/schema.sql', 'utf-8');
const manifest = parseSchemaManifest(schemaSql);

/** The live feed_items as it actually was — CB's 21 columns, no url_hash. */
const BROKEN_FEED_ITEMS: LiveTable = {
  table_name: 'feed_items',
  columns: [
    'id', 'user_id', 'title', 'synthesis', 'tier', 'confidence', 'arrival',
    'platform', 'source_id', 'source_name', 'url', 'image_url', 'byline',
    'published_at', 'category', 'vertical_tags', 'deal_ids', 'action',
    'action_tier', 'breaking', 'cached_at',
  ],
  unique_constraints: [],
  indexes: [],
};

function healthy(table: string): LiveTable {
  const m = manifest.find((t) => t.table === table)!;
  return {
    table_name: table,
    columns: m.columns,
    unique_constraints: m.unique.map((u) => u.join(',')),
    indexes: m.indexes,
  };
}

describe('the manifest parser reads schema.sql', () => {
  it('finds tables, and enough of them to be worth comparing', () => {
    expect(manifest.length).toBeGreaterThan(5);
    const feed = manifest.find((t) => t.table === 'feed_items');
    expect(feed).toBeTruthy();
    expect(feed!.columns).toContain('url_hash');
    expect(feed!.unique).toContainEqual(['user_id', 'url_hash']);
  });

  it('does not mistake a constraint line for a column', () => {
    // `constraint feed_items_user_url_key unique (...)` starts with a word and
    // would parse as a column named "constraint" without the guard.
    const feed = manifest.find((t) => t.table === 'feed_items')!;
    expect(feed.columns).not.toContain('constraint');
    expect(feed.columns).not.toContain('primary');
  });

  it('attaches indexes to their table', () => {
    const feed = manifest.find((t) => t.table === 'feed_items')!;
    expect(feed.indexes).toContain('feed_items_cached_idx');
  });

  it('returns nothing rather than guessing on unparseable input', () => {
    // A checker that invents findings gets muted, and a muted checker reads as
    // coverage while providing none.
    expect(parseSchemaManifest('-- just a comment\n')).toEqual([]);
    expect(parseSchemaManifest('')).toEqual([]);
  });
});

describe('it names the drift that actually happened', () => {
  const drift = compareSchema(
    manifest.filter((t) => t.table === 'feed_items'),
    [BROKEN_FEED_ITEMS],
  );

  it('reports url_hash as a blocking missing column', () => {
    const found = drift.find((d) => d.kind === 'missing-column' && d.detail === 'url_hash');
    expect(found).toBeTruthy();
    expect(found!.severity).toBe('blocking');
    // The message has to name the cause, not just the symptom — a column that
    // is "missing" reads as a typo until you know why it can never arrive.
    expect(found!.why).toContain('create table if not exists');
    expect(found!.why).toContain('migration');
  });

  it('reports the missing unique constraint the upsert depends on', () => {
    const found = drift.find((d) => d.kind === 'missing-unique');
    expect(found).toBeTruthy();
    expect(found!.severity).toBe('blocking');
    expect(found!.detail).toContain('url_hash');
    expect(found!.why).toContain('ON CONFLICT');
  });
});

describe('both directions, and severity distinguishes them', () => {
  it('a hand-added column is a notice, not a blocker', () => {
    const live = healthy('feed_items');
    const drift = compareSchema(
      manifest.filter((t) => t.table === 'feed_items'),
      [{ ...live, columns: [...live.columns, 'added_by_hand'] }],
    );
    expect(drift).toHaveLength(1);
    expect(drift[0].kind).toBe('extra-column');
    expect(drift[0].severity).toBe('notice');
    // Nothing is broken. The record is incomplete, and a fresh environment
    // built from schema.sql will not have it.
    expect(drift[0].why).toContain('fresh environment');
  });

  it('an undeclared unique constraint is a notice that explains itself', () => {
    const live = healthy('feed_items');
    const drift = compareSchema(
      manifest.filter((t) => t.table === 'feed_items'),
      [{ ...live, unique_constraints: [...live.unique_constraints, 'url'] }],
    );
    const found = drift.find((d) => d.kind === 'extra-unique')!;
    expect(found.severity).toBe('notice');
    expect(found.why).toContain('nothing in the repo explains');
  });

  it('a clean table produces no drift at all', () => {
    // The other direction. A comparator that reported something for everything
    // would pass every test above and be useless.
    expect(compareSchema(
      manifest.filter((t) => t.table === 'feed_items'),
      [healthy('feed_items')],
    )).toEqual([]);
  });

  it('column order is not drift', () => {
    const live = healthy('feed_items');
    expect(compareSchema(
      manifest.filter((t) => t.table === 'feed_items'),
      [{ ...live, columns: [...live.columns].reverse() }],
    )).toEqual([]);
  });

  it('constraint column order is not drift either', () => {
    const live = healthy('feed_items');
    expect(compareSchema(
      manifest.filter((t) => t.table === 'feed_items'),
      [{ ...live, unique_constraints: ['url_hash,user_id'] }],
    )).toEqual([]);
  });

  it('a missing table is one finding, not one per column', () => {
    const drift = compareSchema(manifest.filter((t) => t.table === 'feed_items'), []);
    expect(drift).toHaveLength(1);
    expect(drift[0].kind).toBe('missing-table');
  });
});

describe('the report distinguishes "clean" from "could not look"', () => {
  it('a failed read is not ok, and says why', () => {
    // Checklist rule 9. A checker that reports clean when it could not look is
    // the health-surface defect it exists to catch.
    const r = summarise(manifest, null, 'RPC missing');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('RPC missing');
    expect(r.drift).toEqual([]);
    expect(r.checkedTables).toBe(0);
  });

  it('a clean read is ok with a null error and a real table count', () => {
    const r = summarise(
      manifest.filter((t) => t.table === 'feed_items'),
      [healthy('feed_items')],
      null,
    );
    expect(r.ok).toBe(true);
    expect(r.error).toBeNull();
    expect(r.checkedTables).toBe(1);
  });

  it('counts blocking and notices separately', () => {
    const live = healthy('feed_items');
    const r = summarise(
      manifest.filter((t) => t.table === 'feed_items'),
      [{ ...live, columns: live.columns.filter((c) => c !== 'url_hash').concat('stray') }],
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.blocking).toBeGreaterThan(0);
    expect(r.notices).toBeGreaterThan(0);
    expect(r.blocking + r.notices).toBe(r.drift.length);
  });
});

describe('the route is non-gating', () => {
  it('returns 200 even when it finds blocking drift', async () => {
    const src = await readFile('app/api/schema/drift/route.ts', 'utf8');
    // The HTTP status describes whether the CHECK ran, not whether the schema
    // is clean. A monitor that 500s on a finding looks broken exactly when it
    // is working.
    expect(src).not.toContain('status: 500');
    expect(src).not.toContain('status: 503');
    expect(src).toContain('NON-GATING');
  });

  it('reads only, never writes', async () => {
    const src = await readFile('app/api/schema/drift/route.ts', 'utf8');
    for (const w of ['.insert(', '.upsert(', '.update(', '.delete(']) {
      expect(src, `drift route performs ${w}`).not.toContain(w);
    }
  });

  it('ships the RPC it depends on, and says so when it is absent', async () => {
    const src = await readFile('app/api/schema/drift/route.ts', 'utf8');
    expect(src).toContain('schema_snapshot');
    // A missing RPC is a setup gap, not a clean bill.
    expect(src).toContain('20260814_schema_snapshot.sql');
    const sql = await readFile('supabase/migrations/20260814_schema_snapshot.sql', 'utf8');
    expect(sql).toContain('create or replace function schema_snapshot()');
  });
});

/**
 * ═══════════════════════════════════════════════════════════════
 * THE PARSER READ ONE OF THREE UNIQUE SYNTAXES.
 * ═══════════════════════════════════════════════════════════════
 *
 * The first live run of /api/schema/drift reported 24 notices, and two of them
 * were wrong: `user_settings.user_id` and `app_state (user_id, key)` came back
 * as "the database enforces uniqueness that schema.sql does not declare."
 * Both ARE declared — one column-level, one anonymous table-level. The file was
 * right, the database was right, and the checker could read neither form.
 *
 * That is the worse direction for this module. A checker that invents findings
 * gets muted, and a muted checker reads as coverage.
 */
describe('all three ways Postgres spells a unique constraint', () => {
  it('named table-level — the form it already read', () => {
    const m = parseSchemaManifest(`create table if not exists feed_items (
  id uuid primary key,
  user_id uuid,
  url_hash text,
  constraint feed_items_user_url_key unique (user_id, url_hash)
);`);
    expect(m[0].unique).toEqual([['user_id', 'url_hash']]);
  });

  it('ANONYMOUS table-level — app_state', () => {
    const m = parseSchemaManifest(`create table if not exists app_state (
  id uuid primary key,
  user_id uuid,
  key text not null,
  unique(user_id, key)
);`);
    expect(m[0].unique).toEqual([['user_id', 'key']]);
    // And it is not also counted as a column called "unique".
    expect(m[0].columns).toEqual(['id', 'user_id', 'key']);
  });

  it('COLUMN-level — user_settings.user_id', () => {
    const m = parseSchemaManifest(`create table if not exists user_settings (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  theme text
);`);
    expect(m[0].unique).toEqual([['user_id']]);
    expect(m[0].columns).toEqual(['id', 'user_id', 'theme']);
  });

  it('does NOT manufacture a constraint from a column merely NAMED unique-ish', () => {
    // A false unique reports the database as MISSING one, sending somebody to
    // write a migration for a constraint that should not exist.
    const m = parseSchemaManifest(`create table if not exists t (
  id uuid primary key,
  unique_key text,
  uniqueness numeric
);`);
    expect(m[0].unique).toEqual([]);
    expect(m[0].columns).toEqual(['id', 'unique_key', 'uniqueness']);
  });

  it('does NOT read the word out of a trailing comment', () => {
    const m = parseSchemaManifest(`create table if not exists t (
  id uuid primary key,
  slug text -- must be unique per tenant, enforced in app code
);`);
    expect(m[0].unique).toEqual([]);
  });

  it('the REAL schema.sql declares both constraints the live run flagged', async () => {
    // The regression, against the actual file rather than a fixture.
    const sql = await readFile('supabase/schema.sql', 'utf8');
    const manifest = parseSchemaManifest(sql);

    const settings = manifest.find((t) => t.table === 'user_settings')!;
    expect(settings.unique).toContainEqual(['user_id']);

    const state = manifest.find((t) => t.table === 'app_state')!;
    expect(state.unique).toContainEqual(['user_id', 'key']);
  });

  it('so neither reports as extra-unique against a database that has them', async () => {
    const sql = await readFile('supabase/schema.sql', 'utf8');
    const manifest = parseSchemaManifest(sql);
    const live: LiveTable[] = [
      {
        table_name: 'app_state',
        columns: manifest.find((t) => t.table === 'app_state')!.columns,
        unique_constraints: ['user_id,key'],
        indexes: [],
      },
    ];
    const drift = compareSchema(
      manifest.filter((t) => t.table === 'app_state'),
      live,
    );
    expect(drift.filter((d) => d.kind === 'extra-unique')).toEqual([]);
    expect(drift.filter((d) => d.kind === 'missing-unique')).toEqual([]);
  });
});
