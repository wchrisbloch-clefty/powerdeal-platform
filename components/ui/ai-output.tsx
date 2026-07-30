'use client';

import { Check, Copy, Square } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import Button from './button';

/**
 * Streaming AI output panel.
 *
 * Renders markdown-ish text as readable prose without pulling in a markdown
 * renderer — headings, bullets, and bold are the only structures the prompt
 * modules ask for, and a partial stream must never crash a parser mid-token.
 */
export default function AiOutput({
  text,
  streaming,
  error,
  provider,
  model,
  onStop,
  emptyHint,
  className,
}: {
  text: string;
  streaming: boolean;
  error?: string | null;
  provider?: string | null;
  model?: string | null;
  onStop?: () => void;
  emptyHint?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the text is selectable either way.
    }
  }

  if (error) {
    return (
      <div className={cn('rounded-card border border-rule bg-bg-raised p-4', className)}>
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!text && !streaming) {
    return (
      <div
        className={cn(
          'rounded-card border border-dashed border-rule px-4 py-12 text-center',
          className,
        )}
      >
        <p className="text-sm text-text-dim">
          {emptyHint ?? 'Output will stream here.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-card border border-rule bg-bg-raised', className)}>
      <div className="flex items-center justify-between border-b border-rule px-3.5 py-2">
        <div className="flex items-center gap-2">
          {streaming ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="eyebrow">Generating</span>
            </>
          ) : (
            <span className="eyebrow">Output</span>
          )}
          {provider && !streaming ? (
            <span className="font-mono text-[10px] text-text-faint">
              via {provider}
              {model ? ` · ${model}` : ''}
            </span>
          ) : null}
        </div>

        <div className="flex gap-1.5">
          {streaming && onStop ? (
            <Button variant="ghost" size="sm" onClick={onStop}>
              <Square size={12} /> Stop
            </Button>
          ) : null}
          {text ? (
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-thin max-h-[70vh] overflow-y-auto px-4 py-3.5">
        <FormattedText text={text} />
        {streaming ? (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />
        ) : null}
      </div>
    </div>
  );
}

/** Minimal, stream-safe formatter. Never throws on a half-written token. */
function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-text">
      {lines.map((line, i) => {
        const key = `${i}-${line.slice(0, 12)}`;
        const trimmed = line.trim();

        if (!trimmed) return <div key={key} className="h-2" />;

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={key} className="pt-2 font-display text-sm font-medium text-text">
              {inline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={key} className="pt-3 font-display text-base text-text">
              {inline(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={key} className="pt-3 font-display text-lg text-text">
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
              <span className="select-none font-mono text-xs text-text-faint">
                {marker}.
              </span>
              <span>{inline(trimmed.replace(/^\d+[.)]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^[-—]{3,}$/.test(trimmed)) {
          return <hr key={key} className="rule-line my-3" />;
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
