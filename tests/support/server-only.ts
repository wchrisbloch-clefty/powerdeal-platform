/**
 * Stub for the `server-only` package.
 *
 * Its real export throws outside a React Server Component context, which would
 * take down any test that touches lib/forge/generate.ts. Aliased in
 * vitest.config.ts. This is the ONLY substitution the tests make — everything
 * under test is the shipped source.
 */
const serverOnlyStub = {};
export default serverOnlyStub;
