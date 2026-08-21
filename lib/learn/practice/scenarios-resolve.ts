import { loadKnowledge } from '@/lib/skills/knowledge';
import { SCENARIOS, type Scenario } from './scenarios';

/**
 * Does the doctrine this buyer reasons from exist?
 *
 * ⚠️ AN UNRESOLVED SCENARIO IS NOT OFFERED, and the surface says which file is
 * missing. A buyer improvised from general knowledge argues plausibly, and from
 * inside the conversation the reader cannot tell — they would rehearse against
 * objections nobody in this market actually raises and come away more
 * confident, which is worse than not practising.
 *
 * Same shape as lib/learn/paths-resolve.ts, and SERVER ONLY for the same
 * reason: `loadKnowledge` reads the disk.
 */

export interface ResolvedScenario {
  scenario: Scenario;
  available: boolean;
  reason: string | null;
}

export function resolveScenarios(): ResolvedScenario[] {
  return SCENARIOS.map((scenario) => {
    const k = loadKnowledge(scenario.source);
    return {
      scenario,
      available: k.ready,
      reason: k.ready
        ? null
        : (k.error ?? `"${scenario.source}" did not load, and gave no reason.`),
    };
  });
}
