/**
 * The repo's view of the edge contract, kept on the Next side.
 *
 * ⚠️ THIS IS A SECOND COPY OF A NUMBER, which is the pattern this build has
 * watched fail repeatedly — the tokens/Tailwind pair, the TS/SQL seed pair, a
 * lib/design constant against its own fixture. It cannot be avoided by
 * importing: `supabase/functions/_shared/contract.ts` is Deno source, outside
 * the Next module graph and outside tsconfig's include.
 *
 * So it is a copy WITH A CHECK. tests/edge-contract.test.ts parses the Deno
 * file and asserts the two agree, which turns a silent drift into a failing
 * test — the same treatment the seed pair gets.
 */
export const REPO_EDGE_CONTRACT = 3;

/** The functions that carry a contract. Probed in this order. */
export const EDGE_FUNCTION_IDS = ['ccus-sweep', 'market-watch', 'stall-alert'] as const;
