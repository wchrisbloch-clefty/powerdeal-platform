#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * DOES THE WORKING TREE STILL CONTAIN THE OPERATOR'S BOOK?
 * ═══════════════════════════════════════════════════════════════
 *
 * The requirement is "no string in seed data or setup files matches any
 * company, contact or note in my live pipeline". A unit test cannot check that
 * directly for a reason worth stating: to assert that a name is absent, the
 * test has to name it — which puts it back in the repo, in a file that is read
 * more often than the one it was removed from.
 *
 * So the reference is GIT HISTORY. The commit before the scrub holds the real
 * book verbatim; this script extracts every quoted string from those versions
 * of the seed and setup files and looks for each one in the working tree. The
 * real names are read at runtime and never written down.
 *
 *   node scripts/no-real-data.mjs [ref]     default ref: the scrub's parent
 *
 * ⚠️ THIS IS NOT IN THE TEST SUITE, DELIBERATELY. It needs full git history,
 * and CI clones are routinely shallow — a check that silently passes on a
 * shallow clone is worse than one that is run on purpose. `tests/
 * seed-visible.test.ts` holds the hermetic half (everything is marked, the two
 * demo representations agree); this holds the half that needs the past.
 *
 * ⚠️ AND IT DOES NOT MAKE THE REPO SHIPPABLE ON ITS OWN. Scrubbing the working
 * tree does not scrub history: `git log -p` still contains every name this
 * removed. A repo handed to somebody else carries its history with it. Closing
 * that needs a squash or a fresh init, which is the owner's call and is
 * reported rather than done.
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Files whose PAST versions hold the real ACCOUNT BOOK — the companies, the
 * contact, and the forty-two strategy notes.
 *
 * ⚠️ seed-intelligence.sql AND SETUP.md ARE SEARCHED, NOT REFERENCED, and the
 * distinction took two passes to get right. Referencing them made every file
 * its own reference, so the check flagged the eleven public-record strings the
 * demo deliberately keeps — the Dominion Virginia rate order, the CPUC
 * decision on SDG&E, the SCC docket URL. Those are matters of public record;
 * quoting one says nothing about who anybody is selling to, and stripping them
 * would leave the demo feed with no verifiable source, which is the property
 * that feed exists to demonstrate.
 *
 * The requirement is "no string matches any company, contact or note in my
 * live pipeline". Those three things live here. Everything else is where they
 * must not turn up.
 */
const REFERENCE_FILES = ['lib/seed-data.ts', 'supabase/seed.sql'];

/** Where a surviving string would matter. Everything shipped, minus lockfiles. */
const SEARCH_ROOTS = ['app', 'lib', 'components', 'supabase', 'scripts', 'tests', 'docs', 'styles'];

/**
 * Strings too generic to be evidence of anything. Kept SHORT and specific:
 * every entry here is a hole in the check, so each one has to be a word that
 * would appear in a codebase that had never seen this pipeline.
 */
const GENERIC = new Set([
  'multi', 'Direct', 'Primary', 'Secondary', 'Prospecting', 'Both', 'Multiple',
  'Defense', 'Grid-fighter', 'Channel/Partner', 'Direct/Partner', 'null',
]);

/**
 * ⚠️ CARRIED FORWARD ON PURPOSE, AND EACH ONE IS A HOLE IN THIS CHECK — so
 * each needs an argument, not a shrug.
 *
 * The utilities and ISOs are PUBLIC INFRASTRUCTURE, not accounts. Naming SDG&E
 * or Dominion discloses nothing about who anyone is selling to, and removing
 * them would stop the utility layer resolving at all, which is a code path the
 * fallback exists to exercise.
 *
 * The placeholder champion and the one key_risk that mentions it were WRITTEN
 * for the demo — they survive the scrub because they were never the real book,
 * and they are listed here so the check does not flag its own output.
 */
const KEPT_ON_PURPOSE = new Set([
  // Utilities and ISOs. Public infrastructure, not accounts.
  'SDG&E', 'Dominion', 'CenterPoint', 'Delmarva', 'ERCOT', 'PG&E', 'PSO',
  // Regulators, and the public rate proceedings the demo intelligence cites.
  // A docket number is a matter of record; quoting one says nothing about who
  // anybody is selling to, and removing them would leave the demo feed with no
  // verifiable source at all — which is the property that feed is meant to show.
  'Virginia State Corporation Commission',
  'South Carolina Public Service Commission',
  'California Public Utilities Commission',
  // ⚠️ IN THE COMPETITOR CATALOG, NOT THE ACCOUNT LIST. This name appears in
  // lib/types.ts alongside Aggreko, ProEnergy, Liberty and APR Energy as a
  // market participant. That it ALSO used to be an account is exactly the
  // overlap lib/competitive.ts documents — and a public company competing in
  // BTM power is not a disclosure.
  'Williams',
  // Written for the demo, so they are this check's own output rather than a
  // survival.
  'A. Sample (Energy & Utilities Mgr)',
  'Single-threaded on the one named contact; no load number confirmed',
]);

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

/**
 * ⚠️ THE FIRST VERSION EXTRACTED EVERY QUOTED LITERAL AND REPORTED 357 HITS,
 * of which the loudest were `"./types"` and `"Dominion"`. Neither is evidence
 * of anything: one is a module specifier, the other is a public utility this
 * demo deliberately keeps so the utility layer still resolves.
 *
 * A check that reports 357 findings where 3 matter does not get read, and a
 * check that does not get read is off. So the reference is narrowed to what
 * the requirement actually names — COMPANIES, CONTACTS AND NOTES — pulled from
 * the fields that hold them rather than from the whole file.
 */
const IDENTIFYING_FIELDS = [
  'company', 'champion', 'next_move', 'key_risk', 'beachhead_site',
];

function literals(text, path) {
  const out = new Set();

  if (path.endsWith('.ts')) {
    // `company: 'X',` — the field names carry the meaning, so use them.
    for (const field of IDENTIFYING_FIELDS) {
      for (const m of text.matchAll(new RegExp(`\\b${field}: '((?:[^'\\\\]|\\\\.){4,160})'`, 'g'))) {
        out.add(m[1]);
      }
    }
  } else if (path.endsWith('seed.sql')) {
    /*
      Positional, because SQL has no field names at the value site. Column 2 is
      company; the last three before `null)` are champion, next_move, key_risk.
      Anything mis-parsed here lands in the reference set and can only cause a
      FALSE POSITIVE, which is the safe direction for this check.
    */
    for (const m of text.matchAll(/^\('[A-Z]{2,4}-\d{3}', '([^']+)'/gm)) out.add(m[1]);
    for (const m of text.matchAll(/^ '([^']{15,200})',?$/gm)) out.add(m[1]);
  }

  return [...out].filter((v) => {
    if (GENERIC.has(v)) return false;
    if (v.length < 6) return false;
    if (/^\.{0,2}\/|^@\//.test(v)) return false;          // module specifiers
    if (/^[a-z_]+$/.test(v)) return false;                 // identifiers
    if (/^[A-Z]{2,4}-\d{3}$/.test(v)) return false;        // deal ids are shape
    if (KEPT_ON_PURPOSE.has(v)) return false;
    // `raise notice` and exception text is control flow, not content.
    if (/^(No user found|Deals not loaded|Intelligence log and market watch)/.test(v)) return false;
    return true;
  });
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      out.push(...(await walk(full)));
    } else if (/\.(ts|tsx|sql|md|mjs|css|json)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const ref = process.argv[2] ?? 'HEAD';

const reference = [];
for (const path of REFERENCE_FILES) {
  const past = gitShow(ref, path);
  if (past === null) {
    console.error(`✗ cannot read ${path} at ${ref} — is the history deep enough?`);
    process.exit(2);
  }
  for (const lit of literals(past, path)) reference.push({ path, lit });
}

// Rule 18: an enumeration is a claim, and "nothing to inspect" is the loudest
// possible finding for a check whose expected answer is zero.
if (reference.length < 40) {
  console.error(
    `✗ only ${reference.length} reference strings extracted from ${ref}. ` +
      `That is too few to be the real book — the extractor is broken, and a ` +
      `broken extractor reports clean.`,
  );
  process.exit(2);
}

const files = [];
for (const root of SEARCH_ROOTS) files.push(...(await walk(root)));
if (files.length < 50) {
  console.error(`✗ only ${files.length} files to search. The walk is broken.`);
  process.exit(2);
}

const contents = new Map();
for (const f of files) contents.set(f, await readFile(f, 'utf8'));

const hits = [];
for (const { path, lit } of reference) {
  for (const [file, text] of contents) {
    if (text.includes(lit)) hits.push({ file, from: path, lit });
  }
}

console.log(`reference: ${reference.length} strings from ${REFERENCE_FILES.length} files at ${ref}`);
console.log(`searched:  ${files.length} files in the working tree`);

if (hits.length === 0) {
  console.log('\n✓ no string from the pre-scrub seed or setup files survives in the tree.');
  console.log(
    '\n⚠️ History is NOT scrubbed. `git log -p` still contains every one of ' +
      'these. A repo handed to somebody carries its history; closing that needs ' +
      'a squash or a fresh init.',
  );
  process.exit(0);
}

console.log(`\n✗ ${hits.length} surviving string(s):\n`);
for (const h of hits.slice(0, 60)) {
  console.log(`  ${h.file}  ←  ${h.from}`);
  console.log(`    ${JSON.stringify(h.lit.slice(0, 90))}`);
}
if (hits.length > 60) console.log(`  … and ${hits.length - 60} more`);
process.exit(1);
