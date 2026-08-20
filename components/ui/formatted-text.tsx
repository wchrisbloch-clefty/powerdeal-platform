import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════
 * MARKDOWN-ISH TEXT, AT TWO SCALES, WITHOUT A PARSER.
 * ═══════════════════════════════════════════════════════════════
 *
 * Headings, bullets, numbered items, rules and bold are the only structures the
 * prompt modules ask for, and a partial stream must never crash a parser
 * mid-token. So this is a line-at-a-time formatter with no state, and a `**`
 * still waiting for its closing pair renders as the two characters it is.
 *
 * ══ WHY IT HAS A SCALE ══
 *
 * `ui` is the dense scale — the Forge, the Chat panel, anywhere output is being
 * SCANNED next to controls and a table.
 *
 * `reading` is the long-form scale: the serif, 18px, 1.75 leading, capped at
 * the measure. It is the `.prose` class from globals.css, which was written for
 * "Learn, and anywhere someone reads rather than scans" — and which, until this
 * component, no file in the product used. The Learn answer was rendering at
 * `text-sm text-text-dim`, four steps below the scale the design system
 * declares for the one surface it names.
 *
 * ⚠️ THE MEASURE IS THE HALF THAT MATTERS. A line running the full width of a
 * 1400px shell is around 190 characters and the eye loses the return sweep
 * somewhere past 75. Size without a measure makes long reading worse, not
 * better.
 */
export type TextScale = 'ui' | 'reading';

export default function FormattedText({
  text,
  scale = 'ui',
  className,
}: {
  text: string;
  scale?: TextScale;
  className?: string;
}) {
  const reading = scale === 'reading';
  const lines = text.split('\n');

  return (
    <div
      className={cn(
        reading ? 'prose space-y-rhythm-tight' : 'space-y-1.5 text-sm text-text',
        className,
      )}
    >
      {lines.map((line, i) => {
        const key = `${i}-${line.slice(0, 12)}`;
        const trimmed = line.trim();

        if (!trimmed) return <div key={key} className={reading ? 'h-3' : 'h-2'} />;

        if (trimmed.startsWith('### ')) {
          return (
            <h4
              key={key}
              className={cn(
                'font-display font-medium text-text',
                reading ? 'pt-rhythm-tight text-base' : 'pt-2 text-sm',
              )}
            >
              {inline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3
              key={key}
              className={cn(
                'font-display text-text',
                reading ? 'pt-rhythm-block text-lg' : 'pt-3 text-base',
              )}
            >
              {inline(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2
              key={key}
              className={cn(
                'font-display text-text',
                reading ? 'pt-rhythm-block text-xl' : 'pt-3 text-lg',
              )}
            >
              {inline(trimmed.slice(2))}
            </h2>
          );
        }
        if (/^[-*•]\s+/.test(trimmed)) {
          return (
            <div key={key} className="flex gap-2 pl-1">
              <span className="select-none text-text-faint">·</span>
              <span>{inline(trimmed.replace(/^[-*•]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^\d+[.)]\s+/.test(trimmed)) {
          const marker = /^(\d+)[.)]/.exec(trimmed)?.[1] ?? '';
          return (
            <div key={key} className="flex gap-2 pl-1">
              <span
                className={cn(
                  'select-none font-mono tabular-nums text-text-faint',
                  reading ? 'text-sm' : 'text-xs',
                )}
              >
                {marker}.
              </span>
              <span>{inline(trimmed.replace(/^\d+[.)]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^[-—]{3,}$/.test(trimmed)) {
          return <hr key={key} className={cn('rule-line', reading ? 'my-rhythm-block' : 'my-3')} />;
        }

        return <p key={key}>{inline(line)}</p>;
      })}
    </div>
  );
}

/** Bold spans only. A partial `**` at the stream edge renders as literal text. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
