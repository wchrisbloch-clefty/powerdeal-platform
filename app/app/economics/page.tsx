import { getAdminClient, POWERDEAL_USER_ID } from '@/lib/supabase/admin';
import EconomicsPanel, { type DealContext } from '@/components/modules/economics-panel';
import { looseScenarios, scenariosOn } from '@/lib/economics/scenarios';
import { emptyGrid } from '@/lib/economics/presets';
import type { Deal } from '@/lib/types';
import type { Scenario } from '@/lib/economics/types';

export const dynamic = 'force-dynamic';

/**
 * /app/economics
 *
 * Opens standalone or against a deal (?deal=<id>). The deal case is the reason
 * this lives in PowerDeal rather than as its own calculator: the utility, state
 * and MW are already known, and the scenarios it produces belong on the deal
 * record next to the briefs.
 */
export default async function EconomicsPage({
  searchParams,
}: {
  searchParams: Promise<{ deal?: string; scenario?: string }>;
}) {
  const params = await searchParams;
  const client = getAdminClient();

  let deal: DealContext | null = null;
  let scenarios: Scenario[] = [];

  if (params.deal && client) {
    const { data } = await client
      .from('deals')
      .select('id, deal_id, company, utility, state, size_mw, artifacts')
      .eq('id', params.deal)
      .eq('user_id', POWERDEAL_USER_ID)
      .maybeSingle();

    if (data) {
      const row = data as unknown as Deal;
      deal = {
        id: row.id,
        dealId: row.deal_id,
        company: row.company,
        utility: row.utility ?? null,
        state: row.state ?? null,
        sizeMw: row.size_mw ?? null,
      };
      scenarios = scenariosOn(row);
    }
  }

  if (!deal) scenarios = await looseScenarios();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl text-text">Economics</h1>
        <p className="mt-1 text-sm text-text-dim">
          Levelized cost of energy, with the heat-rate chain and the redundancy multiplier
          shown rather than buried. Compare by pinning two configurations, not by moving one
          slider across technologies.
        </p>
      </header>

      {/* Stated once, on the surface, rather than only in a source comment.
          Someone opening this for the first time needs to know the presets are
          intentionally empty before they conclude it is broken. */}
      <div className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5">
        <p className="eyebrow">Preset values</p>
        <p className="mt-1 text-xs text-text-dim">
          Technology presets ship with the right fields and units but no capex or O&amp;M
          figures. Nothing in this build environment could reach a citable source, and a
          plausible-looking default would render identically to a sourced one — then survive
          into a customer conversation because it looked fine. Enter values from a spec sheet
          or published dataset; they will be tagged{' '}
          <span className="font-mono text-2xs uppercase tracking-label">yours</span>, which is
          accurate.
        </p>
      </div>

      <EconomicsPanel
        deal={deal}
        initialScenarios={scenarios}
        prefilledGrid={emptyGrid()}
      />
    </div>
  );
}
