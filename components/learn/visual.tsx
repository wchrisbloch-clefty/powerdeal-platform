import type { CSSProperties } from 'react';
import { CHART_SERIES_TOKENS } from '@/lib/design/chart-palette';
import { GapPanel } from '@/components/ui/gap';
import { cn } from '@/lib/utils';
import type {
  Basis,
  ChainVisual,
  ContrastVisual,
  Datum,
  MagnitudeVisual,
  PartsVisual,
  UnrenderableVisual,
  Visual,
} from '@/lib/learn/visual/schema';

/**
 * ═══════════════════════════════════════════════════════════════
 * THE RENDERER. INDEX IN, TOKEN OUT.
 * ═══════════════════════════════════════════════════════════════
 *
 * The model sends a series INDEX. This file is the only place that turns an
 * index into a colour, and the colour it produces is always a token. There is
 * no path from generated content to a literal — not because a rule forbids it,
 * but because the value never travels as a colour in the first place.
 *
 * ⚠️ EVERY FILL AND STROKE IS `var(--…)`. Enforcement point (c) reads the
 * COMPUTED style off the rendered DOM and asserts each one resolves to a value
 * declared in tokens.css. That check exists despite (b) for the reason this
 * build keeps relearning: a check is subject to the defects it tests for, so
 * something has to read the artifact. (b) cannot catch a token name we typo'd,
 * an inline style added later, or a variable that does not resolve.
 */

/** The one mapping. Bounded by the palette, so an out-of-range index cannot index past it. */
function seriesToken(index: number): string {
  const token = CHART_SERIES_TOKENS[index % CHART_SERIES_TOKENS.length];
  return `var(${token})`;
}

/**
 * The props every mark that CARRIES a series colour must spread.
 *
 * ⚠️ `data-series` IS NOT A LABEL, IT IS A PROMISE THAT THIS ELEMENT IS
 * PAINTED — and the check needed it because a mutation survived without it.
 *
 * Rewriting `seriesToken` to return `var(--chart-1-9)` — a token name typed
 * wrong, the first failure the plan for enforcement point (c) named — made the
 * whole palette pass go green. An unresolvable `var()` makes the declaration
 * invalid at computed-value time, `background-color` falls back to its initial
 * value of transparent, and a pass that skips transparent skips it. Twenty-four
 * fewer colours were read and nothing said so: 489 painted values instead of
 * 513, no findings either way.
 *
 * That is the shape this whole build keeps meeting. "Painted correctly" and
 * "not painted at all" were the same reading, and the bars had vanished. So the
 * elements that must be painted say so in the markup, and the pass asserts they
 * were — the count is no longer something only a reader who knew the old number
 * could notice.
 */
function seriesPaint(index: number, style?: CSSProperties) {
  return { 'data-series': index, style: { ...style, background: seriesToken(index) } };
}

export default function LearnVisual({ visual }: { visual: Visual }) {
  return (
    <figure
      /**
       * ⚠️ THE HOOK ENFORCEMENT POINT (c) SELECTS ON. It is not decoration and
       * it is not for styling: `scripts/render-check.mjs` reads computed fills
       * inside `[data-visual]` and asserts each resolves to a value declared in
       * tokens.css. Removing this attribute does not break a test — it makes
       * the palette pass find nothing, which is why that pass fails loudly when
       * it finds nothing rather than reporting clean.
       */
      data-visual={visual.kind}
      className="my-rhythm-page rounded-card border border-rule bg-bg-raised p-4"
    >
      <figcaption className="mb-rhythm-tight">
        <h3 className="font-display text-base text-text">{visual.title}</h3>
        {visual.takeaway ? (
          <p className="mt-0.5 max-w-measure text-sm text-text-dim">{visual.takeaway}</p>
        ) : null}
      </figcaption>

      {visual.kind === 'magnitude' ? <Magnitude v={visual} /> : null}
      {visual.kind === 'parts' ? <Parts v={visual} /> : null}
      {visual.kind === 'chain' ? <Chain v={visual} /> : null}
      {visual.kind === 'contrast' ? <Contrast v={visual} /> : null}
      {visual.kind === 'unrenderable' ? <Unrenderable v={visual} /> : null}

      <ProvenanceFoot visual={visual} />
    </figure>
  );
}

// ── magnitude ──────────────────────────────────────────────────

function Magnitude({ v }: { v: MagnitudeVisual }) {
  const max = Math.max(...v.data.map((d) => Math.abs(d.value)), 1);
  return (
    <div>
      <p className="mb-1.5 font-mono text-2xs uppercase tracking-label text-text-faint">
        {v.measure}
      </p>
      <ul className="space-y-2">
        {v.data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2">
            <span className="truncate text-sm text-text">{d.label}</span>
            <span className="h-3 rounded-sm bg-bg-overlay">
              <span
                className="block h-3 rounded-sm"
                {...seriesPaint(d.series, {
                  width: `${Math.max(2, (Math.abs(d.value) / max) * 100)}%`,
                })}
              />
            </span>
            <Value d={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── parts ──────────────────────────────────────────────────────

function Parts({ v }: { v: PartsVisual }) {
  /* ⚠️ THE TOTAL IS COMPUTED HERE AND NEVER STATED BY THE MODEL. A stated
     total that disagrees with its own components is a number nobody can
     check, and it renders with exactly the confidence of one that adds up. */
  const total = v.data.reduce((n, d) => n + Math.abs(d.value), 0) || 1;
  return (
    <div>
      <p className="mb-1.5 font-mono text-2xs uppercase tracking-label text-text-faint">
        {v.whole}
      </p>
      <div className="flex h-4 w-full overflow-hidden rounded-sm">
        {v.data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            title={`${d.label} · ${d.value} ${d.unit}`}
            {...seriesPaint(d.series, { width: `${(Math.abs(d.value) / total) * 100}%` })}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {v.data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              {...seriesPaint(d.series)}
              aria-hidden
            />
            <span className="text-text-dim">{d.label}</span>
            <Value d={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── chain ──────────────────────────────────────────────────────

function Chain({ v }: { v: ChainVisual }) {
  return (
    <ol className="space-y-2">
      {v.steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className="rounded-card border border-rule-faint bg-bg p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-text">{s.label}</span>
            {s.value !== null && s.unit ? (
              <span className="font-mono text-sm tabular-nums text-text">
                {s.value.toLocaleString()} {s.unit}
                <BasisMark basis={s.basis} />
              </span>
            ) : (
              /* A step with no value is legitimate — it transforms rather than
                 measures. `unavailable` says so; a zero would be a claim. */
              <span className="font-mono text-2xs uppercase tracking-label text-text-faint">
                no figure
              </span>
            )}
          </div>
          <p className="mt-0.5 max-w-measure text-xs text-text-dim">{s.operation}</p>
        </li>
      ))}
    </ol>
  );
}

// ── contrast ───────────────────────────────────────────────────

function Contrast({ v }: { v: ContrastVisual }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left">
            <th scope="col" className="py-1.5 pr-3 font-mono text-2xs uppercase tracking-label text-text-faint">
              Dimension
            </th>
            <th scope="col" className="py-1.5 pr-3 text-sm font-medium text-text">{v.leftLabel}</th>
            <th scope="col" className="py-1.5 text-sm font-medium text-text">{v.rightLabel}</th>
          </tr>
        </thead>
        <tbody>
          {v.rows.map((r, i) => (
            <tr key={`${r.dimension}-${i}`} className="border-b border-rule-faint last:border-0">
              <td className="py-1.5 pr-3 text-text-dim">{r.dimension}</td>
              {/* ⚠️ `favours` MARKS A SIDE, IT DOES NOT SCORE ONE. No number, no
                  tally, no running total — the guardrail is that a comparison
                  never becomes a scoreboard with the numbers removed. */}
              <td className={cn('py-1.5 pr-3', r.favours === 'left' ? 'text-text' : 'text-text-dim')}>
                {r.left}
              </td>
              <td className={cn('py-1.5', r.favours === 'right' ? 'text-text' : 'text-text-dim')}>
                {r.right}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── the honest failure ─────────────────────────────────────────

function Unrenderable({ v }: { v: UnrenderableVisual }) {
  /*
    ⚠️ DRAWN, NOT DROPPED. A visual that vanishes looks exactly like a model
    deciding there was nothing worth drawing, and a reader cannot tell those
    apart. `blocked` is the gap vocabulary's existing word for "this could not
    be produced and here is why" — the same object the rest of the platform
    uses, so an unrenderable visual reads as a known state rather than a bug.
  */
  return (
    <GapPanel
      kind="blocked"
      subject={`a "${v.wanted}" visual`}
      reason={v.reason}
      className="px-0 py-2"
    />
  );
}

// ── shared ─────────────────────────────────────────────────────

function Value({ d }: { d: Datum }) {
  return (
    <span className="whitespace-nowrap font-mono text-sm tabular-nums text-text">
      {d.value.toLocaleString()} {d.unit}
      <BasisMark basis={d.basis} />
    </span>
  );
}

/**
 * ⚠️ `illustrative` IS MARKED IN THE FIGURE, not only in the footer.
 *
 * A number chosen to make a teaching point must never be quotable as a fact
 * about the world, and a reader who screenshots one row does not get the
 * footer. The mark rides with the number.
 */
function BasisMark({ basis }: { basis: Basis }) {
  if (basis.kind !== 'illustrative') return null;
  return (
    <span
      title={`Illustrative — chosen to make the point, not a measured figure. ${basis.source}`}
      className="ml-1 font-mono text-2xs uppercase tracking-label text-warning"
    >
      illus.
    </span>
  );
}

function ProvenanceFoot({ visual }: { visual: Visual }) {
  const { bases, unfilled } = visual.provenance;
  if (bases.length === 0 && unfilled.length === 0) return null;

  return (
    <div className="mt-rhythm-block border-t border-rule-faint pt-2">
      {bases.length > 0 ? (
        <p className="max-w-measure text-2xs text-text-faint">
          <span className="font-mono uppercase tracking-label">Built from</span>{' '}
          {bases.map((b) => `${b.source} (${b.kind})`).join(' · ')}
        </p>
      ) : null}
      {/* Named, never silently absent — the same rule the utility layer and the
          gap system follow everywhere else in this product. */}
      {unfilled.length > 0 ? (
        <p className="mt-1 max-w-measure text-2xs text-text-dim">
          <span className="font-mono uppercase tracking-label text-warning">Not available</span>{' '}
          {unfilled.join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
