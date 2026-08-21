import { AlertTriangle } from 'lucide-react';
import type { Finding } from '@/lib/learn/practice/guardrail';

/**
 * ═══════════════════════════════════════════════════════════════
 * WHAT THEY TOOK AWAY, AND WHAT IS STILL OPEN.
 * ═══════════════════════════════════════════════════════════════
 *
 * Two observations about the CONVERSATION. Neither says how it went.
 *
 * ⚠️ SHARED BY TWO SURFACES, WHICH IS THE POINT. A practice exchange is
 * rendered live in the Practice card and again in the answer pane when the
 * session is resumed from the list. Before this component existed, only the
 * first one knew what a `powerdeal-practice` fence was — resuming an exchange
 * put the raw JSON tail on the screen as a code block, which is precisely the
 * "a figure arrives as its own source code" defect the block parser was written
 * to stop, reappearing one route over.
 */
export default function Observations({
  tookAway,
  stillOpen,
  findings,
}: {
  tookAway: string | null;
  stillOpen: string[];
  findings: Finding[];
}) {
  const nothing = !tookAway && stillOpen.length === 0;

  return (
    <div className="space-y-1.5 border-t border-rule-faint pt-2">
      {findings.length > 0 ? <GuardrailNote findings={findings} /> : null}

      {tookAway ? (
        <p className="max-w-measure text-2xs text-text-dim">
          <span className="font-mono uppercase tracking-label text-text-faint">
            What they took away
          </span>{' '}
          {tookAway}
        </p>
      ) : null}

      {stillOpen.length > 0 ? (
        <div>
          <p className="font-mono text-2xs uppercase tracking-label text-text-faint">
            Still open
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {stillOpen.map((s, i) => (
              <li key={i} className="max-w-measure text-2xs text-text-dim">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Said rather than left blank: no observations at all is a state, and it
          is not the same as observations that have not arrived. */}
      {nothing && findings.length === 0 ? (
        <p className="text-2xs text-text-faint">No observations came back with this turn.</p>
      ) : null}
    </div>
  );
}

/**
 * ⚠️ THE FINDING IS SHOWN AND THE TEXT IS LEFT ALONE.
 *
 * Removing the graded sentence would leave a surface that always looks
 * compliant, and the reader would never learn the prompt had drifted. The quote
 * is verbatim so the call can be checked — a guardrail that reports without
 * evidence is asking to be trusted, which is the thing this product does not do
 * anywhere else either.
 */
export function GuardrailNote({ findings }: { findings: Finding[] }) {
  return (
    <div className="mb-rhythm-tight rounded-card border border-warning/40 bg-warning/5 px-3 py-2">
      <p className="flex items-start gap-2 text-2xs text-text">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <span className="max-w-measure">
          This reply graded you. Practice here is ungraded, so that is a defect in the
          prompt rather than something to take on board — the reply is shown unedited.
        </span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {findings.map((f, i) => (
          <li key={i} className="max-w-measure text-2xs text-text-dim">
            <span className="font-mono uppercase tracking-label text-warning">{f.rule}</span>{' '}
            <span className="text-text">“{f.phrase}”</span> in {f.where} — {f.why}
          </li>
        ))}
      </ul>
    </div>
  );
}
