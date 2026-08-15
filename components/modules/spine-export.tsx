'use client';

import { useState } from 'react';
import { Loader2, Copy, Check, Download } from 'lucide-react';
import Button from '@/components/ui/button';

/**
 * SPINE EXPORT — copy or download the pipeline as markdown, for pinning.
 *
 * READ-ONLY. There is no counterpart to this control: nothing anywhere in the
 * app accepts a Spine back. A chat that could update deals is the silent-write
 * risk this build spent two weeks removing, and the absence of an import
 * button is the feature.
 *
 * The copy path fetches fresh every time rather than caching. A stale
 * clipboard is exactly the failure the date stamp exists to make visible, and
 * caching would reintroduce it one layer below the stamp.
 */
export default function SpineExport() {
  const [state, setState] = useState<'idle' | 'working' | 'copied' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/spine/export');
      const markdown = await res.text();
      await navigator.clipboard.writeText(markdown);
      setState('copied');
      setTimeout(() => setState('idle'), 1800);
    } catch (err) {
      // Named rather than swallowed. A copy button that silently does nothing
      // leaves the operator pasting whatever was on the clipboard before.
      setState('failed');
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={copy} disabled={state === 'working'}>
          {state === 'working' ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : state === 'copied' ? (
            <Check size={13} aria-hidden />
          ) : (
            <Copy size={13} aria-hidden />
          )}
          {state === 'copied' ? 'Copied' : 'Copy markdown'}
        </Button>

        {/* A plain link, not a script-driven save: the browser handles the
            filename from Content-Disposition and the file is date-stamped. */}
        <a
          href="/api/spine/export?download=1"
          className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-2xs text-text-dim hover:text-text"
        >
          <Download size={12} aria-hidden />
          Download .md
        </a>
      </div>

      {state === 'failed' ? (
        <p className="text-2xs text-danger">
          Could not copy — {error}. Nothing was placed on your clipboard.
        </p>
      ) : null}

      <p className="text-2xs text-text-faint">
        Read-only and date-stamped. Nothing writes back to a deal through this path
        — there is no import, deliberately. Health, MEDDPICC and days-in-stage are
        derived, so a hand-maintained copy goes stale the moment they recompute.
      </p>
    </div>
  );
}
