'use client';

import { useMemo, useState } from 'react';
import { Copy, Download, Pin, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SourcedField from './economics/sourced-field';
import StackedBar from './economics/stacked-bar';
import SensitivityView from './economics/sensitivity-view';
import TierChip from './economics/tier-chip';
import { computeAll, incentiveContributions } from '@/lib/economics/lcoe';
import { sensitivity } from '@/lib/economics/sensitivity';
import { defaultSelections, INCENTIVES } from '@/lib/economics/incentives';
import {
  HEAT_RATE_REFERENCE,
  PRESETS,
  REFERENCE_FUEL_PRICE,
  defaultFinance,
  emptyGrid,
  hasFourCpExposure,
  presetFor,
} from '@/lib/economics/presets';
import { deltaRows, exportJson, soften, summaryText } from '@/lib/economics/format';
import { userValue } from '@/lib/economics/types';
import { GROUP_COPY } from '@/lib/economics/model-inputs';
import type {
  FinanceInputs,
  GridInputs,
  IncentiveSelection,
  Scenario,
  Sourced,
  TechInputs,
  TechKey,
} from '@/lib/economics/types';

export interface DealContext {
  id: string;
  dealId: string;
  company: string;
  utility: string | null;
  state: string | null;
  sizeMw: number | null;
}

/**
 * ECONOMICS MODULE
 *
 * Live recalc on every input change — the whole interaction model is that you
 * move a lever and the bar moves. Everything is derived in a single useMemo
 * from the input state, so there is no possibility of the displayed number and
 * the displayed breakdown disagreeing.
 */
export default function EconomicsPanel({
  deal,
  initialScenarios,
  prefilledGrid,
}: {
  deal: DealContext | null;
  initialScenarios: Scenario[];
  prefilledGrid: GridInputs | null;
}) {
  const [tech, setTech] = useState<TechKey>('sofc');
  const [inputs, setInputs] = useState<TechInputs>(() => presetFor('sofc').inputs);
  const [finance, setFinance] = useState<FinanceInputs>(defaultFinance);
  const [grid, setGrid] = useState<GridInputs>(() => prefilledGrid ?? emptyGrid());
  const [incentives, setIncentives] = useState<IncentiveSelection[]>(() =>
    defaultSelections('sofc'),
  );
  const [pinned, setPinned] = useState<Scenario[]>(initialScenarios);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [capexCase, setCapexCase] = useState<string>('base');
  const [tab, setTab] = useState<'model' | 'sensitivity'>('model');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isGrid = presetFor(tech).usesGridInputs;
  const showFourCp = hasFourCpExposure(deal?.state);

  const result = useMemo(
    () => computeAll(inputs, finance, grid, { includeFourCp: showFourCp, gridOnly: isGrid }),
    [inputs, finance, grid, showFourCp, isGrid],
  );

  const contributions = useMemo(
    () =>
      incentiveContributions(incentives, {
        effectiveCapexPerKw: result.lcoe?.effectiveCapexPerKw ?? null,
        capacityFactor: finance.capacityFactor.value,
        crf: result.lcoe?.crf ?? null,
      }),
    [incentives, result.lcoe, finance.capacityFactor.value],
  );

  const sensitivityRows = useMemo(
    () => (tab === 'sensitivity' ? sensitivity(inputs, finance) : []),
    [tab, inputs, finance],
  );

  const compared = pinned.find((p) => p.id === compareId) ?? null;

  /** Editing any value clears its provenance — it is now the user's number. */
  const setTechField = (key: keyof TechInputs) => (value: number | null) =>
    setInputs((prev) => ({ ...prev, [key]: userValue(value, prev[key].unit) }));

  const setFinanceField = (key: keyof FinanceInputs) => (value: number | null) =>
    setFinance((prev) => ({ ...prev, [key]: userValue(value, prev[key].unit) }));

  const setGridField = (key: keyof GridInputs) => (value: number | null) =>
    setGrid((prev) => ({ ...prev, [key]: userValue(value, prev[key].unit) }));

  function loadPreset(key: TechKey) {
    const preset = presetFor(key);
    setTech(key);
    setInputs(preset.inputs);
    setIncentives(defaultSelections(key));
    setCapexCase(preset.capexCases?.[0]?.id ?? 'base');
  }

  /**
   * Switch between published capex cases. Both are Lazard figures; neither is
   * a default we chose, which is why this is a visible control rather than a
   * silent pick.
   */
  function loadCapexCase(id: string) {
    const found = presetFor(tech).capexCases?.find((c) => c.id === id);
    if (!found) return;
    setCapexCase(id);
    setInputs((prev) => ({ ...prev, capexPerKw: found.capex }));
  }

  function currentScenario(name: string): Scenario {
    return {
      id: `sc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name,
      tech,
      inputs,
      finance,
      grid,
      incentives,
      result,
      createdAt: new Date().toISOString(),
      dealId: deal?.id ?? null,
    };
  }

  function pin() {
    const name = window.prompt(
      'Name this scenario',
      `${presetFor(tech).label}${deal ? ` · ${deal.company}` : ''}`,
    );
    if (!name) return;
    setPinned((prev) => [currentScenario(name), ...prev]);
    setNotice('Pinned to the scenario tray.');
  }

  function loadScenario(s: Scenario) {
    setTech(s.tech);
    setInputs(s.inputs);
    setFinance(s.finance);
    setGrid(s.grid);
    setIncentives(s.incentives);
    setCompareId(null);
    setNotice(`Loaded "${s.name}" for editing.`);
  }

  async function saveToDeal(s: Scenario) {
    if (!deal) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/economics/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id, scenario: { ...s, dealId: deal.id } }),
      });
      const json = await res.json();
      setNotice(res.ok ? `Saved to ${deal.dealId}.` : `Save failed: ${json.error ?? res.status}`);
    } catch (err) {
      setNotice(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copySummary() {
    await navigator.clipboard.writeText(summaryText(currentScenario('Current configuration')));
    setNotice('Summary copied.');
  }

  function download() {
    const s = currentScenario('Exported configuration');
    const blob = new Blob([exportJson(s)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `economics-${s.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-rhythm-page">
      {/* ── Deal context ── */}
      {deal ? (
        <div className="rounded-card border border-accent-border bg-accent-bg px-3.5 py-2.5">
          <p className="eyebrow">Deal context</p>
          <p className="mt-1 text-sm text-text">
            <span className="font-medium">{deal.dealId}</span> · {deal.company}
            {deal.sizeMw ? ` · ${deal.sizeMw} MW` : ''}
            {deal.utility ? ` · ${deal.utility}` : ''}
            {deal.state ? ` · ${deal.state}` : ''}
          </p>
        </div>
      ) : null}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-rule" role="tablist">
        {(['model', 'sensitivity'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'min-h-tap lg:min-h-tap-sm border-b-2 px-3 text-sm capitalize transition-colors duration-fast',
              tab === t
                ? 'border-accent-mark text-text'
                : 'border-transparent text-text-dim hover:text-text',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {notice ? (
        <p role="status" className="rounded-sm bg-bg-raised px-3 py-2 text-xs text-text-dim">
          {notice}
        </p>
      ) : null}

      {tab === 'sensitivity' ? (
        <SensitivityView rows={sensitivityRows} baseline={result.lcoe?.total ?? null} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ⚠️ ORDER, NOT JUST COLUMNS. The rail is the second grid child, so
              below 1024 it stacked BENEATH fourteen input cards — roughly 3,600
              pixels of sliders at iPad width before the reader reaches the
              number the surface exists to produce. On desktop it is a sticky
              right rail and reads correctly; at the two breakpoints where most
              of this gets used, the answer was last.

              order-first flips it under lg and leaves the desktop grid exactly
              as it was. The lead tile, on a third surface. */}
          <div className="order-2 space-y-5 lg:order-none">
            {/* ── Technology ── */}
            <section className="rounded-card border border-rule bg-bg-raised p-4">
              <label htmlFor="tech" className="eyebrow">
                Technology
              </label>
              <select
                id="tech"
                value={tech}
                onChange={(e) => loadPreset(e.target.value as TechKey)}
                className="mt-1.5 min-h-tap lg:min-h-tap-sm w-full rounded-sm border border-rule bg-bg px-2 text-sm text-text focus:border-accent-mark focus:outline-none"
              >
                {PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-2xs text-text-faint">{presetFor(tech).note}</p>
            </section>

            {/* ── Inputs ── */}
            {isGrid ? (
              <GridPanel
                grid={grid}
                onChange={setGridField}
                showFourCp={showFourCp}
                state={deal?.state ?? null}
              />
            ) : (
              <section className="rounded-card border border-rule bg-bg-raised p-4">
                <SectionHeading
                  title={GROUP_COPY.tech.title}
                  body={GROUP_COPY.tech.body}
                />

                <SourcedField
                  label="Efficiency"
                  sourced={inputs.efficiencyPct}
                  min={1}
                  max={100}
                  step={0.5}
                  onChange={setTechField('efficiencyPct')}
                  derived={
                    result.lcoe?.heatRateBtuPerKwh
                      ? `Heat rate ${Math.round(result.lcoe.heatRateBtuPerKwh).toLocaleString()} Btu/kWh`
                      : 'Heat rate — set efficiency'
                  }
                  hint={
                    presetFor(tech).heatRateNote ??
                    'Drives fuel cost through heat rate. 3,412 ÷ efficiency.'
                  }
                />

                {presetFor(tech).capexCases ? (
                  <div className="border-b border-rule-faint py-3">
                    <p className="text-sm font-medium text-text">Capex case</p>
                    <p className="mt-0.5 text-2xs text-text-faint">
                      The source publishes more than one. Neither is a default we picked.
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {presetFor(tech).capexCases!.map((c) => (
                        <label key={c.id} className="flex gap-2 text-xs text-text">
                          <input
                            type="radio"
                            name="capex-case"
                            checked={capexCase === c.id}
                            onChange={() => loadCapexCase(c.id)}
                            className="mt-0.5 accent-accent-mark"
                          />
                          <span>
                            {c.label}
                            {c.condition ? (
                              <span className="block text-2xs text-text-faint">
                                {c.condition}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                <SourcedField
                  label="Capex"
                  sourced={inputs.capexPerKw}
                  min={0}
                  max={12000}
                  step={25}
                  onChange={setTechField('capexPerKw')}
                />

                <SourcedField
                  label="Redundancy"
                  sourced={inputs.redundancyPct}
                  min={0}
                  max={100}
                  step={1}
                  onChange={setTechField('redundancyPct')}
                  derived={
                    result.lcoe?.effectiveCapexPerKw
                      ? `Effective capex $${Math.round(result.lcoe.effectiveCapexPerKw).toLocaleString()}/kW`
                      : 'Effective capex — set capex'
                  }
                  hint="Overbuild required to serve firm load. Nameplate $/kW is the wrong number to compare."
                />

                <SourcedField
                  label="O&M"
                  sourced={inputs.omPerKwYr}
                  min={0}
                  max={400}
                  step={1}
                  onChange={setTechField('omPerKwYr')}
                />

                <SourcedField
                  label="Variable O&M"
                  sourced={inputs.variableOmPerMwh}
                  min={0}
                  max={40}
                  step={0.25}
                  onChange={setTechField('variableOmPerMwh')}
                  hint="Per unit of output, so it converts straight to ¢/kWh — no capacity factor involved."
                />

              </section>
            )}

            {/* ── Finance ── */}
            <section className="rounded-card border border-rule bg-bg-raised p-4">
              <SectionHeading
                title={GROUP_COPY.finance.title}
                body={GROUP_COPY.finance.body}
              />
              <SourcedField
                label="Fuel price"
                sourced={finance.fuelPricePerMmbtu}
                min={0}
                max={30}
                step={0.1}
                onChange={setFinanceField('fuelPricePerMmbtu')}
                disabled={isGrid}
              />
              <SourcedField
                label="Capacity factor"
                sourced={finance.capacityFactor}
                min={0.05}
                max={1}
                step={0.01}
                onChange={setFinanceField('capacityFactor')}
                warning={presetFor(tech).capacityFactorWarning}
              />
              <SourcedField
                label="Cost of capital"
                sourced={finance.costOfCapitalPct}
                min={0}
                max={25}
                step={0.25}
                onChange={setFinanceField('costOfCapitalPct')}
              />
              <SourcedField
                label="Term"
                sourced={finance.termYears}
                min={1}
                max={40}
                step={1}
                onChange={setFinanceField('termYears')}
              />
            </section>

            {/* ── Constraints ──
                ⚠️ THESE FIVE WERE IN THE TECHNOLOGY STACK, above, at the same
                weight as capex and efficiency, each with its own slider. None
                of them is read by computeLcoe. A slider that visibly does
                nothing to the answer is the strongest possible claim that it
                should, and fourteen equal fields is also just fourteen equal
                fields — no glance tells you which two decide the number.

                Moved, not removed: a 26-week lead time kills a deal a good
                LCOE cannot save. Same controls, same reachability, nothing
                disabled, nothing defaulted. The membership of this group is
                asserted against lcoe.ts rather than typed from memory. */}
            {!isGrid ? (
              <section className="rounded-card border border-rule-faint p-4">
                <SectionHeading
                  title={GROUP_COPY.constraints.title}
                  body={GROUP_COPY.constraints.body}
                  subordinate
                />

                <SourcedField
                  label="Asset life"
                  sourced={inputs.assetLifeYears}
                  min={0}
                  max={50}
                  step={1}
                  onChange={setTechField('assetLifeYears')}
                  hint="Deliberately not wired to the financing term — a 30-year asset financed over 20 is an ordinary structure."
                />

                <SourcedField
                  label="Service interval"
                  sourced={inputs.serviceIntervalHrs}
                  min={0}
                  max={100000}
                  step={1000}
                  onChange={setTechField('serviceIntervalHrs')}
                  hint="Informs the capacity-factor assumption you enter above. Not itself a cost input."
                />

                <SourcedField
                  label="Temperature derate"
                  sourced={inputs.tempDeratePct}
                  min={0}
                  max={50}
                  step={0.5}
                  onChange={setTechField('tempDeratePct')}
                  hint="Output loss on hot days."
                />

                <SourcedField
                  label="Min unit size"
                  sourced={inputs.minUnitMw}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={setTechField('minUnitMw')}
                  hint="Granularity of the build. Decides whether a site can be served at all."
                />

                <SourcedField
                  label="Lead time"
                  sourced={inputs.leadTimeMonths}
                  min={0}
                  max={72}
                  step={1}
                  onChange={setTechField('leadTimeMonths')}
                  hint="Order-to-energisation. The constraint that most often decides a deal on its own."
                />
              </section>
            ) : null}

            {/* ── Incentives ── */}
            <IncentivePanel
              selections={incentives}
              contributions={contributions}
              onChange={setIncentives}
            />

            {/* ── Heat-rate reference ── */}
            {!isGrid ? (
              <section className="rounded-card border border-rule-faint p-4">
                <p className="eyebrow">Heat-rate reference</p>
                <p className="mt-1 text-2xs text-text-faint">
                  The conversion worked at ${REFERENCE_FUEL_PRICE.toFixed(2)}/MMBtu. Reference
                  only — not mapped to any technology above.
                </p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-text-faint">
                      <th className="font-normal">Efficiency</th>
                      <th className="font-normal">Heat rate</th>
                      <th className="text-right font-normal">Fuel ¢/kWh</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums text-text-dim">
                    {HEAT_RATE_REFERENCE.map((r) => (
                      <tr key={r.efficiencyPct}>
                        <td>{r.efficiencyPct}%</td>
                        <td>{r.heatRate.toLocaleString()}</td>
                        <td className="text-right">{r.fuelCents.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </div>

          {/* ── Result rail ── */}
          <div className="order-1 space-y-4 lg:order-none lg:sticky lg:top-4 lg:self-start">
            <ResultCard
              result={result}
              isGrid={isGrid}
              contributions={contributions}
              compared={compared}
            />

            <div className="flex flex-wrap gap-2">
              <RailButton onClick={pin} icon={Pin} label="Pin as scenario" />
              <RailButton onClick={copySummary} icon={Copy} label="Copy summary" />
              <RailButton onClick={download} icon={Download} label="Export JSON" />
            </div>

            <ScenarioTray
              scenarios={pinned}
              compareId={compareId}
              onCompare={setCompareId}
              onLoad={loadScenario}
              onRemove={(id) => setPinned((prev) => prev.filter((s) => s.id !== id))}
              onSave={deal ? saveToDeal : null}
              busy={busy}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A section heading inside the model panel.
 *
 * ⚠️ REPLACES `<p className="eyebrow">`, WHICH RENDERED THE HEADING SMALLER
 * THAN THE FIELDS UNDER IT. `.eyebrow` is 2xs uppercase mono — the same step as
 * the hint lines inside each field, and a step BELOW the field labels it was
 * supposed to govern. So "Technology inputs" was the quietest text in a section
 * of fourteen louder ones, and the stack read as one undifferentiated list.
 *
 * An eyebrow is a label above a heading. Used as the heading, it inverts the
 * hierarchy it exists to establish.
 *
 * `subordinate` is the one deliberate exception: the constraints group SHOULD
 * sit below the cost drivers, so its heading takes the smaller step — quieter
 * than the cost sections, still louder than the fields it governs.
 */
function SectionHeading({
  title,
  body,
  subordinate,
}: {
  title: string;
  body: string;
  subordinate?: boolean;
}) {
  return (
    <div className="mb-rhythm-tight">
      <h3
        className={cn(
          'font-display text-text',
          subordinate ? 'text-sm' : 'text-base',
        )}
      >
        {title}
      </h3>
      <p className="mt-0.5 max-w-measure text-2xs text-text-faint">{body}</p>
    </div>
  );
}

// ── Result ─────────────────────────────────────────────────────────

function ResultCard({
  result,
  isGrid,
  contributions,
  compared,
}: {
  result: ReturnType<typeof computeAll>;
  isGrid: boolean;
  contributions: { key: string; label: string; cents: number | null; condition: string | null }[];
  compared: Scenario | null;
}) {
  const net =
    result.lcoe && contributions.length > 0
      ? result.lcoe.total + contributions.reduce((sum, c) => sum + (c.cents ?? 0), 0)
      : null;

  return (
    <section className="rounded-card border border-rule bg-bg-raised p-4">
      <p className="eyebrow">{isGrid ? 'Levelized delivered cost' : 'LCOE'}</p>

      {isGrid ? (
        result.grid ? (
          <>
            <p className="mt-1 font-mono text-3xl text-text tabular-nums">
              {result.grid.levelized.toFixed(2)}
              <span className="ml-1 text-sm text-text-dim">¢/kWh</span>
            </p>
            <p className="mt-1 text-xs text-text-dim">
              Year one {result.grid.yearOne.toFixed(2)}¢ · escalation compounds over the term
            </p>
          </>
        ) : (
          <Incomplete missing={result.missing} />
        )
      ) : result.lcoe ? (
        <>
          <p className="mt-1 font-mono text-3xl text-text tabular-nums">
            {result.lcoe.total.toFixed(2)}
            <span className="ml-1 text-sm text-text-dim">¢/kWh</span>
          </p>
          {net !== null && Math.abs(net - result.lcoe.total) > 0.001 ? (
            <p className="mt-0.5 font-mono text-sm text-accent-dim tabular-nums">
              {net.toFixed(2)}¢ after incentives
            </p>
          ) : null}
          <div className="mt-3">
            <StackedBar breakdown={result.lcoe} />
          </div>
        </>
      ) : (
        <Incomplete missing={result.missing} />
      )}

      {compared && result.lcoe && compared.result.lcoe ? (
        <div className="mt-4 border-t border-rule-faint pt-3">
          <p className="eyebrow">vs. {compared.name}</p>
          <ul className="mt-1.5 space-y-1">
            {deltaRows(result, compared.result).map((row) => (
              <li key={row.label} className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-text-dim">{row.label}</span>
                <span
                  className={cn(
                    'font-mono text-xs tabular-nums',
                    row.diff === null
                      ? 'text-text-faint'
                      : row.diff < 0
                        ? 'text-accent-dim'
                        : row.diff > 0
                          ? 'text-danger'
                          : 'text-text-dim',
                  )}
                >
                  {row.diff === null
                    ? '—'
                    : `${row.diff > 0 ? '+' : ''}${row.diff.toFixed(2)}¢`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Incomplete({ missing }: { missing: { field: string; label: string }[] }) {
  return (
    <div className="mt-2">
      <p className="font-mono text-3xl text-text-faint tabular-nums">—</p>
      <p className="mt-1 text-xs text-text-dim">
        {/*
          ⚠️ WAS `.join(', ').toLowerCase()`, WHICH RENDERED "capex $/kw, o&m
          $/kw-yr". Units are not prose: kW is a kilowatt and kw is nothing,
          and O&M lowercased stops being an abbreviation. The lowercasing was
          there to make the labels read as a sentence fragment after "Needs" —
          it bought a comma's worth of grammar and cost the units their meaning,
          on the one line that tells the reader what to go and find.

          Only the first character of the first label is lowered, and only when
          it is a plain ASCII capital followed by a lowercase letter — so
          "Efficiency" softens to "efficiency" and "O&M" and "Capex $/kW" are
          left exactly as their sources wrote them.
        */}
        {missing.length > 0
          ? `Needs ${soften(missing[0].label)}${missing
              .slice(1)
              .map((m) => `, ${m.label}`)
              .join('')}.`
          : 'Fill the inputs to see a result.'}
      </p>
    </div>
  );
}

// ── Grid ───────────────────────────────────────────────────────────

function GridPanel({
  grid,
  onChange,
  showFourCp,
  state,
}: {
  grid: GridInputs;
  onChange: (k: keyof GridInputs) => (v: number | null) => void;
  showFourCp: boolean;
  state: string | null;
}) {
  return (
    <section className="rounded-card border border-rule bg-bg-raised p-4">
      <SectionHeading
        title="Delivered rate components"
        body="What the utility actually bills, itemised. Escalation is the lever — doing nothing has a scheduled, compounding cost."
      />
      <SourcedField
        label="Energy charge"
        sourced={grid.energyCentsPerKwh}
        min={0}
        max={40}
        step={0.1}
        onChange={onChange('energyCentsPerKwh')}
      />
      <SourcedField
        label="Demand charge"
        sourced={grid.demandPerKwMonth}
        min={0}
        max={60}
        step={0.25}
        onChange={onChange('demandPerKwMonth')}
      />
      <SourcedField
        label="Transmission (¢/kWh)"
        sourced={grid.transmissionCentsPerKwh}
        min={0}
        max={20}
        step={0.1}
        onChange={onChange('transmissionCentsPerKwh')}
      />
      <SourcedField
        label="Transmission ($/kW-mo)"
        sourced={grid.transmissionPerKwMonth}
        min={0}
        max={30}
        step={0.25}
        onChange={onChange('transmissionPerKwMonth')}
        hint="Both forms are offered because tariffs bill it either way; they sum."
      />
      <SourcedField
        label="Ancillary"
        sourced={grid.ancillaryCentsPerKwh}
        min={0}
        max={10}
        step={0.05}
        onChange={onChange('ancillaryCentsPerKwh')}
      />
      <SourcedField
        label="Escalation"
        sourced={grid.escalationPct}
        min={0}
        max={15}
        step={0.1}
        onChange={onChange('escalationPct')}
        hint="The compounding lever. A flat comparison hides what doing nothing costs on schedule."
      />
      {showFourCp ? (
        <SourcedField
          label="4CP exposure"
          sourced={grid.fourCpPerKwYr}
          min={0}
          max={200}
          step={1}
          onChange={onChange('fourCpPerKwYr')}
          hint={`ERCOT only — shown because this deal is in ${state}.`}
        />
      ) : null}
    </section>
  );
}

// ── Incentives ─────────────────────────────────────────────────────

function IncentivePanel({
  selections,
  contributions,
  onChange,
}: {
  selections: IncentiveSelection[];
  contributions: { key: string; label: string; cents: number | null; condition: string | null }[];
  onChange: (next: IncentiveSelection[]) => void;
}) {
  const update = (key: string, patch: Partial<IncentiveSelection>) =>
    onChange(selections.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <section className="rounded-card border border-rule bg-bg-raised p-4">
      <SectionHeading
        title="Incentives"
        body="Itemized, never lumped. Each carries its own condition and contributes separately."
      />

      <ul className="space-y-3">
        {selections.map((sel) => {
          const def = INCENTIVES.find((d) => d.key === sel.key)!;
          const contribution = contributions.find((c) => c.key === sel.key);

          return (
            <li key={sel.key} className="border-b border-rule-faint pb-3 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-tap lg:min-h-tap-sm items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={sel.enabled}
                    onChange={(e) => update(sel.key, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-accent-mark"
                  />
                  {def.label}
                </label>

                <div className="flex items-center gap-2">
                  <TierChip sourced={sel.amount} />
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`${def.label} amount`}
                    value={sel.amount.value ?? ''}
                    placeholder="—"
                    disabled={!sel.enabled}
                    onChange={(e) =>
                      update(sel.key, {
                        amount: userValue(
                          e.target.value === '' ? null : Number(e.target.value),
                          def.unit,
                        ) as Sourced,
                      })
                    }
                    className="w-20 min-h-tap rounded-sm border border-rule bg-bg px-1.5 py-1 text-right font-mono text-sm text-text tabular-nums lg:min-h-tap-sm focus:border-accent-mark focus:outline-none disabled:opacity-40"
                  />
                  <span className="w-16 font-mono text-2xs text-text-faint">{def.unit}</span>
                </div>
              </div>

              {/* REC fuel pathway — a bare $/MWh figure is not a claim this
                  module will make, so the pathway selector is inline and its
                  condition renders below regardless of state. */}
              {sel.key === 'rec' && sel.enabled ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-2xs text-text-faint">Fuel pathway</span>
                  <select
                    aria-label="REC fuel pathway"
                    value={sel.fuelPathway ?? 'pipeline-natural-gas'}
                    onChange={(e) =>
                      update(sel.key, {
                        fuelPathway: e.target.value as IncentiveSelection['fuelPathway'],
                      })
                    }
                    className="min-h-tap lg:min-h-tap-sm rounded-sm border border-rule bg-bg px-2 text-xs text-text focus:border-accent-mark focus:outline-none"
                  >
                    <option value="pipeline-natural-gas">Pipeline natural gas</option>
                    <option value="renewable-fuel">Renewable fuel</option>
                  </select>
                </div>
              ) : null}

              {sel.enabled && contribution?.condition ? (
                <p className="mt-1.5 border-l-2 border-rule pl-2 text-2xs text-text-dim">
                  {contribution.condition}
                </p>
              ) : null}

              {sel.enabled ? (
                <p className="mt-1 font-mono text-2xs text-text-faint tabular-nums">
                  {contribution?.cents === null || contribution?.cents === undefined
                    ? 'Contribution not computed — see condition.'
                    : `${contribution.cents.toFixed(3)}¢/kWh`}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Scenario tray ──────────────────────────────────────────────────

function ScenarioTray({
  scenarios,
  compareId,
  onCompare,
  onLoad,
  onRemove,
  onSave,
  busy,
}: {
  scenarios: Scenario[];
  compareId: string | null;
  onCompare: (id: string | null) => void;
  onLoad: (s: Scenario) => void;
  onRemove: (id: string) => void;
  onSave: ((s: Scenario) => void) | null;
  busy: boolean;
}) {
  return (
    <section className="rounded-card border border-rule p-4">
      <p className="eyebrow">Scenario tray</p>
      {scenarios.length === 0 ? (
        <p className="mt-2 text-xs text-text-dim">
          Configure a technology fully, then pin it. Load another and the delta appears against
          the pin — two honest configurations, not one slider moving everything.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {scenarios.map((s) => (
            <li key={s.id} className="rounded-sm border border-rule-faint p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-text">{s.name}</span>
                <span className="shrink-0 font-mono text-xs text-text-dim tabular-nums">
                  {s.result.lcoe
                    ? `${s.result.lcoe.total.toFixed(2)}¢`
                    : s.result.grid
                      ? `${s.result.grid.levelized.toFixed(2)}¢`
                      : '—'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <TrayButton
                  onClick={() => onCompare(compareId === s.id ? null : s.id)}
                  active={compareId === s.id}
                  label={compareId === s.id ? 'Comparing' : 'Compare'}
                />
                <TrayButton onClick={() => onLoad(s)} label="Load" />
                {onSave ? (
                  <TrayButton onClick={() => onSave(s)} label={busy ? 'Saving…' : 'Save to deal'} icon={Save} />
                ) : null}
                <TrayButton onClick={() => onRemove(s.id)} label="Remove" icon={Trash2} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Buttons ────────────────────────────────────────────────────────

function RailButton({
  onClick,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  icon: typeof Pin;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex min-h-tap lg:min-h-tap-sm items-center gap-1.5 rounded-sm border border-rule px-2.5 text-xs text-text transition-colors duration-fast hover:border-accent-mark hover:text-accent-dim"
    >
      <Icon size={13} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

function TrayButton({
  onClick,
  label,
  active,
  icon: Icon,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  icon?: typeof Pin;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex min-h-tap lg:min-h-tap-sm items-center gap-1 rounded-sm border px-2 text-2xs transition-colors duration-fast xl:min-h-0 xl:py-1',
        active
          ? 'border-accent-mark bg-accent-bg text-accent-dim'
          : 'border-rule text-text-dim hover:text-text',
      )}
    >
      {Icon ? <Icon size={11} strokeWidth={1.75} aria-hidden /> : null}
      {label}
    </button>
  );
}
