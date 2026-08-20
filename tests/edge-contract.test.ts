import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { REPO_EDGE_CONTRACT, EDGE_FUNCTION_IDS } from '@/lib/edge-contract-shared';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE TWO COPIES OF THE CONTRACT NUMBER MUST AGREE.
 * ═══════════════════════════════════════════════════════════════
 *
 * `supabase/functions/_shared/contract.ts` is Deno source — outside the Next
 * module graph, outside tsconfig's include — so the Next side cannot import it
 * and holds its own copy in lib/edge-contract-shared.ts.
 *
 * That is a second copy of a number, which is the pattern this build has
 * watched fail on the tokens/Tailwind pair, the TS/SQL seed pair, and a
 * lib/design constant against its own fixture. It is unavoidable here and it
 * is not unchecked: this parses the Deno file and compares.
 *
 * ⚠️ IF THEY DRIFT, THE HEALTH SURFACE LIES IN THE MOST CONFUSING DIRECTION.
 * A repo constant left behind would report a correctly-deployed function as
 * "ahead of this repo", sending the reader to investigate a deployment that is
 * fine.
 */

const DENO_CONTRACT = 'supabase/functions/_shared/contract.ts';

describe('the contract number is one number in two places', () => {
  it('the Deno constant and the Next constant agree', async () => {
    const src = await readFile(DENO_CONTRACT, 'utf8');
    const m = /export const EDGE_CONTRACT = (\d+)/.exec(src);
    expect(m, 'EDGE_CONTRACT not found — the parser is broken, not the code').not.toBeNull();
    expect(Number(m![1])).toBe(REPO_EDGE_CONTRACT);
  });

  it('the function list matches the functions that exist', async () => {
    // N derived from the directory, so a fourth function joins the probe by
    // existing rather than by somebody remembering to list it.
    const { readdir } = await import('node:fs/promises');
    const dirs = (await readdir('supabase/functions', { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== '_shared')
      .map((e) => e.name)
      .sort();
    expect([...EDGE_FUNCTION_IDS].sort()).toEqual(dirs);
  });
});

describe('the contract is readable without running the job', () => {
  it('every response helper carries the header, including the refusals', async () => {
    /*
      ⚠️ THE BODY-ONLY VERSION MADE ONE FUNCTION UNVERIFIABLE. A body field is
      returned on the SUCCESS path; for stall-alert a 200 means the job RAN and
      incremented days_in_stage on every in-flight deal. The only way to read
      its version was to age the whole book by a day.

      "Which version is deployed" is a question about the deployment, not the
      work. It must be answerable by a request that is refused.
    */
    const src = await readFile('supabase/functions/_shared/auth.ts', 'utf8');
    expect(src).toContain("export const CONTRACT_HEADER = 'x-powerdeal-contract'");

    for (const helper of ['unauthorized', 'ok', 'serverError']) {
      const at = src.indexOf(`export function ${helper}(`);
      expect(at, `${helper} not found`).toBeGreaterThan(-1);
      const body = src.slice(at, src.indexOf('\n}', at));
      expect(body, `${helper} does not take a contract`).toMatch(/contract: number/);
      expect(body, `${helper} does not send the header`).toContain('headers(contract)');
    }
  });

  it('every function passes its contract to every response', async () => {
    for (const fn of EDGE_FUNCTION_IDS) {
      const src = await readFile(`supabase/functions/${fn}/index.ts`, 'utf8');
      expect(src, `${fn} refuses without a contract`).toContain('unauthorized(EDGE_CONTRACT)');
      expect(src, `${fn} errors without a contract`).toContain('serverError(err, EDGE_CONTRACT)');
      expect(src, `${fn} succeeds without a contract`).toContain('}, EDGE_CONTRACT)');
    }
  });

  it('the probe uses a wrong secret and never fires a job', async () => {
    /*
      A status check that changes the thing it reports on is not a status
      check. stall-alert's success path ages every in-flight deal, so this page
      must be structurally incapable of triggering it.
    */
    const src = await readFile('lib/edge-contract.ts', 'utf8');
    expect(src).toContain("'x-cron-secret': 'contract-probe-not-a-secret'");
    // It must not reach for the real secret, even if one is in the environment.
    expect(src).not.toContain('CRON_SECRET');
  });

  it('unreachable is not reported as a version finding', async () => {
    // It says something about the network this page renders on, not about a
    // deployment. Reporting it beside a real gap buries the one that matters.
    const src = await readFile('components/modules/agent-health.tsx', 'utf8');
    const block = src.slice(src.indexOf('function DeployedBehind'));
    expect(block).toContain("c.state === 'behind' || c.state === 'unstamped'");
    expect(block).not.toMatch(/state === 'unreachable'/);
  });

  it('the banner is silent when every function is current', async () => {
    const src = await readFile('components/modules/agent-health.tsx', 'utf8');
    const block = src.slice(src.indexOf('function DeployedBehind'));
    expect(block).toContain('if (stale.length === 0 && ahead.length === 0) return null;');
  });
});
