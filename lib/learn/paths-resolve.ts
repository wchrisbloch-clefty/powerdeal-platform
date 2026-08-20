import { loadKnowledge } from '@/lib/skills/knowledge';
import { LEARN_PATHS, type LearnPath } from './paths';

/**
 * ═══════════════════════════════════════════════════════════════
 * DOES THE DOCTRINE BEHIND THIS PATH ACTUALLY EXIST?
 * ═══════════════════════════════════════════════════════════════
 *
 * A path is five questions and a claim: that the answers come out of a
 * knowledge file this platform holds. The claim is checkable, so it is checked.
 *
 * ⚠️ AN UNRESOLVED PATH RENDERS AS A GAP, NOT AS QUESTIONS. Offering the
 * questions anyway would work — the model would answer them from general
 * knowledge, fluently, and the reader would have no way to tell they were
 * getting something other than the doctrine. That is the fabricated-default
 * problem exactly: the ungrounded version is indistinguishable from the
 * grounded one at the point of reading.
 *
 * ⚠️ AND `retired` IS NOT `missing`. `loadKnowledge` already draws that line —
 * an awaited file is one somebody should go and find; a retired one would do
 * harm if supplied. The reason travels through rather than being flattened into
 * "unavailable".
 *
 * SERVER ONLY. `loadKnowledge` reads the disk, so this is the one file in
 * lib/learn that cannot run in the browser — which is why it is separate from
 * paths.ts rather than living in it.
 */

export interface ResolvedPath {
  path: LearnPath;
  available: boolean;
  /** Null when available. The loader's own reason when not. */
  reason: string | null;
}

export function resolvePaths(): ResolvedPath[] {
  return LEARN_PATHS.map((path) => {
    const k = loadKnowledge(path.source);
    return {
      path,
      available: k.ready,
      reason: k.ready ? null : (k.error ?? `"${path.source}" did not load, and gave no reason.`),
    };
  });
}
