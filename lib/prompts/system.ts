import { readFileSync } from 'fs';
import { join } from 'path';
import { POWERDEAL_VERSION } from '@/lib/brand';

/**
 * ═══════════════════════════════════════════════════════════════
 * THIS FILE LOADS THE POWERDEAL BRAIN.
 * ═══════════════════════════════════════════════════════════════
 *
 * GLOBAL RULE 6: the system prompt is NEVER generated or inferred in code.
 * It is read verbatim from the committed markdown file, which is synced by
 * hand from the Claude.ai project.
 *
 * To update the brain: edit the file named by POWERDEAL_VERSION in prompts/,,
 * commit, push. Vercel redeploys and the new methodology is live.
 *
 * Server-only — `fs` is unavailable in the browser bundle. Import this from
 * route handlers, server components, and server actions only.
 */

export const PROMPT_FILENAME = `powerdeal-v${POWERDEAL_VERSION}-system-prompt.md`;
const PROMPT_PATH = join(process.cwd(), 'prompts', PROMPT_FILENAME);

/**
 * Marker present only while the file is an un-synced stub. When the real
 * prompt is pasted in, this line goes away and the brain reports ready.
 */
const PLACEHOLDER_SENTINEL = 'PD-PLACEHOLDER-SENTINEL';

function load(): { text: string; ready: boolean; error: string | null } {
  try {
    const text = readFileSync(PROMPT_PATH, 'utf-8');
    if (text.includes(PLACEHOLDER_SENTINEL)) {
      return {
        text,
        ready: false,
        error:
          `prompts/${PROMPT_FILENAME} is still the placeholder. Paste the ` +
          `PowerDeal v${POWERDEAL_VERSION} system prompt from Claude.ai and commit.`,
      };
    }
    if (text.trim().length < 200) {
      return {
        text,
        ready: false,
        error: `prompts/${PROMPT_FILENAME} looks truncated (${text.trim().length} chars).`,
      };
    }
    return { text, ready: true, error: null };
  } catch (err) {
    return {
      text: '',
      ready: false,
      error: `Could not read prompts/${PROMPT_FILENAME}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

const loaded = load();

/** The PowerDeal methodology, verbatim from the markdown file. */
export const SYSTEM_PROMPT = loaded.text;

/** False while the prompt file is a placeholder — domain tasks must refuse. */
export const BRAIN_READY = loaded.ready;

/** Human-readable reason the brain is unavailable, or null when ready. */
export const BRAIN_ERROR = loaded.error;

/**
 * Guard for domain-reasoning entry points. Generating a "brief" or a
 * qualification verdict against a stub prompt would produce confident output
 * that does not follow the methodology — fail loudly instead.
 */
export function assertBrainReady(): void {
  if (!BRAIN_READY) {
    throw new Error(
      BRAIN_ERROR ?? 'PowerDeal system prompt is not available.',
    );
  }
}

/**
 * Identity spine for autonomous agents (edge functions), mirroring CB Hub's
 * `CB_IDENTITY` pattern. This is a compact operating charter, NOT a
 * substitute for the full methodology — interactive domain tasks always
 * load SYSTEM_PROMPT.
 */
export const POWERDEAL_IDENTITY = `You are PowerDeal Strategist — an elite BD/AE advisor and full deal-execution platform for behind-the-meter SOFC baseload power sales, aligned with Bloom Energy.

GUIDING STAR: The grid and combustion engines each force a tradeoff. We force none. Every output advances a real deal or surfaces deal-killing risk faster.

OPERATING RULES:
- Thesis first, then support. Bad news blunt, no cushion. Default currency: US$.
- Never invent pricing, heat rates, permitting timelines, REC values, or competitor specs.
- Never pitch before diagnosing — grid vs. combustion first.
- Bloom is aligned, never a competitor. Gate the reference arsenal.
- Always pair "Class I REC-eligible" with the fuel-pathway condition.`;
