import 'server-only';

/**
 * ═══════════════════════════════════════════════════════════════
 * IS THE DEPLOYED EDGE FUNCTION THE CODE IN THIS REPO?
 * ═══════════════════════════════════════════════════════════════
 *
 * A `window_hours: 336` request and a `window_hours: 48` request came back
 * byte-identical. The parameter was in the source and not in the deployment,
 * and the only thing separating those two readings was a field MISSING from
 * the response — a signal that works once, for a reader who already knows what
 * the source returns.
 *
 * ⚠️ AND THE DEEPER FINDING WAS THE DEPLOY GAP ITSELF. Every other part of
 * this system had a path from repo to production that somebody could run. The
 * edge functions had none — no local clone, no deploy step in anyone's hands —
 * which is exactly how a deployed function sat days behind a commit with
 * nobody able to see it. The path exists now. This makes the STATE visible, so
 * the next drift is a row on a page rather than an archaeology exercise.
 *
 * ══ WHY THIS PROBES WITH A DELIBERATELY WRONG SECRET ══
 *
 * The contract travels in a header on EVERY response, including 401. So the
 * question "which version is deployed" is answered by a request that is
 * refused — no side effects, no secret needed here, and it works for
 * stall-alert, whose success path increments days_in_stage on every in-flight
 * deal and is therefore not something a status page may trigger.
 *
 * A status check that changes the thing it reports on is not a status check.
 */

import { EDGE_FUNCTION_IDS, REPO_EDGE_CONTRACT } from './edge-contract-shared';

export type ContractState = 'current' | 'behind' | 'ahead' | 'unreachable' | 'unstamped';

export interface EdgeContractStatus {
  fn: string;
  deployed: number | null;
  expected: number;
  state: ContractState;
  detail: string;
}

const CONTRACT_HEADER = 'x-powerdeal-contract';

function functionsBase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return url.replace('.supabase.co', '.functions.supabase.co');
}

async function probe(fn: string, base: string): Promise<EdgeContractStatus> {
  const expected = REPO_EDGE_CONTRACT;
  try {
    const res = await fetch(`${base}/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Deliberately invalid. The response is refused and the header still
        // carries the version, which is the whole design.
        'x-cron-secret': 'contract-probe-not-a-secret',
      },
      body: '{}',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    const raw = res.headers.get(CONTRACT_HEADER);
    if (raw === null) {
      return {
        fn,
        deployed: null,
        expected,
        state: 'unstamped',
        detail:
          `${fn} answered ${res.status} without a contract header. That deployment ` +
          `predates the header entirely, so it is behind by at least one version ` +
          `and its actual age cannot be read.`,
      };
    }

    const deployed = Number(raw);
    if (!Number.isFinite(deployed)) {
      return { fn, deployed: null, expected, state: 'unstamped', detail: `${fn} sent a non-numeric contract: "${raw}".` };
    }
    if (deployed === expected) {
      return { fn, deployed, expected, state: 'current', detail: `${fn} is at contract ${deployed}.` };
    }
    if (deployed < expected) {
      return {
        fn,
        deployed,
        expected,
        state: 'behind',
        detail:
          `${fn} is deployed at contract ${deployed}; this repo is at ${expected}. ` +
          `Anything added since ${deployed} is in the source and not in production — ` +
          `parameters sent to it are accepted and discarded.`,
      };
    }
    return {
      fn,
      deployed,
      expected,
      state: 'ahead',
      detail:
        `${fn} is deployed at contract ${deployed}, AHEAD of this repo's ${expected}. ` +
        `Someone deployed from a newer tree than this one.`,
    };
  } catch (err) {
    return {
      fn,
      deployed: null,
      expected,
      state: 'unreachable',
      detail: `${fn} could not be reached: ${(err as Error).message}. Not a version finding.`,
    };
  }
}

/**
 * Probe every edge function. Returns null when there is no Supabase URL to
 * probe — which is a deployment state, not an outage, and must not render as
 * three unreachable functions.
 */
export async function edgeContractStatus(): Promise<EdgeContractStatus[] | null> {
  const base = functionsBase();
  if (!base) return null;
  return Promise.all(EDGE_FUNCTION_IDS.map((fn) => probe(fn, base)));
}
