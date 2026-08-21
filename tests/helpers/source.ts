/**
 * ═══════════════════════════════════════════════════════════════
 * READ THE CODE, NOT THE DOCUMENTATION ABOUT IT.
 * ═══════════════════════════════════════════════════════════════
 *
 * Three checks in this repo have now reported on prose:
 *
 *   · tests/hydration.test.ts flagged agent-health.tsx for
 *     `suppressHydrationWarning`, on the strength of a comment EXPLAINING the
 *     mechanism;
 *   · tests/capture.test.ts failed lib/capture/fields.ts for importing
 *     supabase, because a comment named supabase/schema.sql as a source;
 *   · tests/health-parity.test.ts failed the health migration for containing
 *     `set updated_at = updated_at`, which appears in the paragraph explaining
 *     why the PREVIOUS migration's use of it was the defect.
 *
 * Every one was the check being wrong, and every one cost a debugging cycle
 * before that was obvious. Three times is a mechanism problem: this file is
 * the mechanism.
 *
 * ⚠️ THE COMMENTS IN THIS REPO ARE LONG AND THEY QUOTE THE DEFECTS THEY
 * DESCRIBE. That is deliberate and it is why the collision keeps happening — a
 * codebase whose comments name the exact strings its tests search for will
 * produce this failure indefinitely unless the tests strip them first.
 */

/**
 * Strip comments from TypeScript, JavaScript or SQL source.
 *
 * ⚠️ NOT A PARSER, AND IT WILL NOT PRETEND TO BE. A `--` inside a SQL string
 * literal, or `//` inside a TypeScript string, is stripped along with the rest
 * of the line. That is acceptable for the assertions this serves — they search
 * for identifiers and statements, not for string contents — and a real parser
 * per language is a dependency this does not need. Stated rather than hidden,
 * which is the same treatment the narrow `Date.now()` matcher gets.
 */
export function codeOnly(src: string, lang: 'ts' | 'sql' = 'ts'): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/^[ \t]*\/\/.*$/gm, '');
  if (lang === 'sql') out = out.replace(/--.*$/gm, '');
  return out;
}

/**
 * Assert-friendly: the imports a module actually declares.
 *
 * A comment mentioning a module is not an import of it, which is the specific
 * shape that failed in tests/capture.test.ts.
 */
export function importsOf(src: string): string[] {
  return [...codeOnly(src).matchAll(/^import[\s\S]*?from '([^']+)';/gm)].map((m) => m[1]);
}
