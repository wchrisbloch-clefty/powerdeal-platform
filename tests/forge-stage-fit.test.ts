import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { STAGE_FIT, suggestedAction, suggestionReason } from '@/lib/forge/stage-fit';
import { DEAL_STAGES } from '@/lib/types';

/**
 * ═══════════════════════════════════════════════════════════════
 * SUGGESTS, NEVER GATES.
 * ═══════════════════════════════════════════════════════════════
 *
 * Six documents in one column at identical weight, in a fixed order with no
 * relationship to the deal on screen. The surface knows the stage and said
 * nothing about it.
 *
 * The mark is the whole change. Every document stays available in every stage —
 * nothing hidden, disabled, reordered out of reach, or defaulted away from what
 * the operator last picked. Ordering rather than pressure, which is the trade
 * `nextGaps` already makes, under a non-negotiable that has not moved: nothing
 * blocks, no disabled controls, no fabricated defaults.
 */

describe('the stage map is complete and honest', () => {
  it('covers every declared stage, with N from the type', () => {
    // A hardcoded eleven looks identical to somebody stopping at nine. The
    // Record<DealStage, …> type caught exactly that once already, when a stage
    // that does not exist was listed and one that does was omitted.
    expect(DEAL_STAGES.length).toBeGreaterThan(0);
    for (const stage of DEAL_STAGES) {
      expect(stage in STAGE_FIT, `${stage} has no entry`).toBe(true);
    }
    expect(Object.keys(STAGE_FIT).sort()).toEqual([...DEAL_STAGES].sort());
  });

  it('returns nothing rather than reaching for a next-best document', () => {
    // Terminal stages hold null on purpose. A suggestion invented to fill the
    // slot is noise wearing the same mark as a real one — the same rule
    // nextGaps follows when a stage's fields are already filled.
    for (const stage of ['Closed-Won', 'Post-Sale', 'Archived']) {
      expect(suggestedAction(stage)).toBeNull();
      expect(suggestionReason(stage)).toBeNull();
    }
  });

  it('an unknown stage is null, not a guess', () => {
    expect(suggestedAction('Not A Stage')).toBeNull();
    expect(suggestedAction('')).toBeNull();
  });

  it('every suggestion names a document that exists', async () => {
    /*
      ⚠️ THE FAILURE THIS PREVENTS IS SILENT. A typo'd id suggests nothing —
      no button matches, no mark renders, and the panel looks exactly as it did
      before the feature. Checked against the action list in the panel rather
      than a copy of it here.
    */
    const src = await readFile('components/modules/forge-panel.tsx', 'utf8');
    const ids = [...src.matchAll(/^\s{4}id: '([a-z-]+)',$/gm)].map((m) => m[1]);
    expect(ids.length, 'no FORGE_ACTIONS ids parsed — the extractor is broken').toBeGreaterThan(4);

    for (const [stage, id] of Object.entries(STAGE_FIT)) {
      if (id === null) continue;
      expect(ids, `${stage} suggests "${id}", which is not a document`).toContain(id);
    }
  });
});

describe('the panel marks without gating', () => {
  it('no document is disabled, hidden or filtered by the suggestion', async () => {
    const src = await readFile('components/modules/forge-panel.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // The list is mapped whole. A .filter() here would be the gate.
    expect(code).toContain('FORGE_ACTIONS.map(');
    expect(code).not.toMatch(/FORGE_ACTIONS\s*\.\s*filter/);
    // The suggestion must not reach the button's disabled state or its order.
    expect(code).not.toMatch(/disabled=\{[^}]*suggested/);
    expect(code).not.toMatch(/sort\([^)]*suggested/);
    // And it must not silently become the default selection.
    expect(code).not.toMatch(/setActionId\(suggested/);
  });

  it('the heading is louder than the buttons it governs', async () => {
    // Was `eyebrow` — 2xs uppercase mono, a step below the text-sm labels
    // beneath it and the same step as the format line inside each button.
    const src = await readFile('components/modules/forge-panel.tsx', 'utf8');
    expect(src).toContain('<h3 className="font-display text-base text-text">Document type</h3>');
    expect(src).not.toContain('<p className="eyebrow">Document type</p>');
  });
});
