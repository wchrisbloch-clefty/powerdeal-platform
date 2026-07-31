'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { UserSettings } from '@/lib/types';
import type { VerticalConfig, SourceConfig } from '@/lib/verticals/types';
import { PLATFORM_LABELS, type FeedPlatform } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import ProvenanceChip from '@/components/ui/provenance-chip';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';

/** Shape of GET /api/feed/health. Route modules can only export handlers. */
interface SourceHealthReport {
  checked: number;
  ok: number;
  broken: number;
  sources: {
    id: string;
    name: string;
    status: 'ok' | 'empty' | 'error';
    httpStatus: number | null;
    itemCount: number;
    message: string | null;
  }[];
}

/**
 * SOURCES — everything the feed can pull from, in one place.
 *
 * This lived inside Settings, which put curation two levels away from the feed
 * it curates and split it from the social sources entirely. RSS and social are
 * the same decision — "do I want this channel in my stream?" — so they are
 * grouped together here, by platform, each independently toggleable.
 *
 * Core and discovery keep opposite defaults on purpose, and the copy says so:
 * a core source is on unless muted, a discovery net is off unless chosen.
 * Discovery results never enter the feed, they only reveal what the core
 * sources missed, so opting into one has to be a deliberate act.
 */
export default function SourcesPanel({
  vertical,
  settings,
  canPersist,
}: {
  vertical: VerticalConfig;
  settings: UserSettings | null;
  canPersist: boolean;
}) {
  const [prefs, setPrefs] = useState(
    settings?.source_prefs ?? { muted: [], enabled: [], order: [], custom: [] },
  );
  const [health, setHealth] = useState<SourceHealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSource, setNewSource] = useState({ name: '', url: '', category: 'power-markets' });

  const healthById = new Map(health?.sources.map((s) => [s.id, s]) ?? []);

  /** Every source the operator can see, keyed by the channel it arrives on. */
  const grouped = useMemo(() => {
    const custom: SourceConfig[] = (prefs.custom ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      platform: 'rss' as const,
      url: c.url,
      defaultTier: c.defaultTier,
      category: c.category,
      role: 'core' as const,
      rationale: 'User-added source.',
    }));

    const all = [
      ...vertical.sources.map((s) => ({ source: s, kind: 'core' as const })),
      ...custom.map((s) => ({ source: s, kind: 'custom' as const })),
      ...vertical.discovery.map((s) => ({ source: s, kind: 'discovery' as const })),
    ];

    const byPlatform = new Map<FeedPlatform, typeof all>();
    for (const entry of all) {
      // Config calls everything with a feed URL "rss"; the host is what tells
      // a Reddit net from a publisher feed.
      const platform = platformForSource(entry.source);
      byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), entry]);
    }
    return [...byPlatform.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [vertical, prefs.custom]);

  function isOn(source: SourceConfig, kind: 'core' | 'discovery' | 'custom'): boolean {
    if (kind === 'discovery') {
      return (prefs.enabled ?? []).includes(source.id) || source.enabledByDefault === true;
    }
    return !(prefs.muted ?? []).includes(source.id);
  }

  function toggle(source: SourceConfig, kind: 'core' | 'discovery' | 'custom') {
    setPrefs((p) => {
      if (kind === 'discovery') {
        const enabled = new Set(p.enabled ?? []);
        if (enabled.has(source.id)) enabled.delete(source.id);
        else enabled.add(source.id);
        return { ...p, enabled: [...enabled] };
      }
      const muted = new Set(p.muted ?? []);
      if (muted.has(source.id)) muted.delete(source.id);
      else muted.add(source.id);
      return { ...p, muted: [...muted] };
    });
  }

  async function checkAll() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/feed/health');
      setHealth((await res.json()) as SourceHealthReport);
    } catch {
      setError('Could not reach the source health check.');
    } finally {
      setChecking(false);
    }
  }

  async function save() {
    if (!canPersist) {
      setError('Supabase is not configured, so source choices cannot be saved.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_prefs: prefs }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save sources.');
    } finally {
      setSaving(false);
    }
  }

  async function addSource() {
    if (!newSource.name.trim() || !newSource.url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', ...newSource }),
      });
      const body = (await res.json()) as { source_prefs?: typeof prefs; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Could not add that source.');
      if (body.source_prefs) setPrefs(body.source_prefs);
      setNewSource({ name: '', url: '', category: 'power-markets' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that source.');
    } finally {
      setSaving(false);
    }
  }

  async function removeCustom(id: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id }),
      });
      const body = (await res.json()) as { source_prefs?: typeof prefs };
      if (body.source_prefs) setPrefs(body.source_prefs);
    } catch {
      setError('Could not remove that source.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-text-dim">
          Everything the feed can pull from, grouped by channel. Core sources are
          on unless you mute them; discovery nets are off unless you choose them,
          and never enter the feed — they only show what your core sources
          missed.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={checkAll} disabled={checking}>
            {checking ? <Loader2 size={13} className="animate-spin" /> : null}
            {checking ? 'Checking…' : 'Check all feeds'}
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saved ? <Check size={13} /> : null}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {health && (
        <div
          className={cn(
            'rounded-card border px-3.5 py-2.5 text-sm',
            health.broken === 0
              ? 'border-accent-border bg-accent-bg text-accent-dim'
              : 'border-rule bg-bg-raised text-text',
          )}
        >
          {health.broken === 0 ? (
            <>All {health.ok} feeds responded with items.</>
          ) : (
            <>
              <strong>{health.broken}</strong> of {health.checked} feeds returned
              nothing. A dead source just makes the feed quieter with no
              explanation — mute it, or fix the URL in{' '}
              <span className="font-mono text-xs">lib/verticals/powerdeal.ts</span>.
            </>
          )}
        </div>
      )}

      {grouped.map(([platform, entries]) => (
        <section key={platform} className="rounded-card border border-rule bg-bg-raised p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="eyebrow">{PLATFORM_LABELS[platform]}</span>
            <span className="font-mono text-2xs text-text-faint">{entries.length}</span>
          </div>

          <div className="space-y-1">
            {entries.map(({ source, kind }) => {
              const on = isOn(source, kind);
              const h = healthById.get(source.id);
              return (
                <label
                  key={source.id}
                  className="flex min-h-tap cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-bg-overlay xl:min-h-0"
                >
                  <input
                    type="checkbox"
                    checked={source.status === 'blocked' ? false : on}
                    disabled={source.status === 'blocked'}
                    onChange={() => toggle(source, kind)}
                    className="mt-1.5 h-5 w-5 shrink-0 accent-[color:var(--color-accent)] xl:h-3.5 xl:w-3.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('text-sm', on ? 'text-text' : 'text-text-faint')}>
                        {source.name}
                      </span>
                      <ProvenanceChip tier={source.defaultTier} />
                      {kind === 'discovery' ? <Badge tone="neutral">Discovery</Badge> : null}
                      {kind === 'custom' ? <Badge tone="accent">Yours</Badge> : null}
                      {source.status === 'blocked' ? <Badge tone="danger">Blocked</Badge> : null}
                      {h && h.status !== 'ok' && source.status !== 'blocked' ? (
                        <Badge tone="danger">No items</Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-dim">
                      {source.rationale}
                    </span>
                    {/* The reason a gap exists, where the gap is visible. */}
                    {source.blockedReason ? (
                      <span className="mt-1 block text-2xs text-danger">
                        {source.blockedReason}
                      </span>
                    ) : null}
                  </span>
                  {kind === 'custom' ? (
                    <button
                      type="button"
                      aria-label={`Remove ${source.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        void removeCustom(source.id);
                      }}
                      className="mt-0.5 shrink-0 text-text-faint hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </label>
              );
            })}
          </div>
        </section>
      ))}

      {/* ── Add your own ── */}
      <section className="rounded-card border border-rule bg-bg-raised p-4">
        <p className="eyebrow mb-2.5">Add a feed</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={newSource.name}
            onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))}
            placeholder="Publisher name"
            className="h-tap xl:h-8 min-w-col-text-min flex-1 rounded-md border border-rule bg-bg px-2 text-xs text-text focus:border-accent-border focus:outline-none"
          />
          <input
            value={newSource.url}
            onChange={(e) => setNewSource((s) => ({ ...s, url: e.target.value }))}
            placeholder="https://example.com/feed.xml"
            className="h-tap xl:h-8 min-w-col-widest-min flex-[2] rounded-md border border-rule bg-bg px-2 text-xs text-text focus:border-accent-border focus:outline-none"
          />
          <select
            value={newSource.category}
            onChange={(e) => setNewSource((s) => ({ ...s, category: e.target.value }))}
            className="h-tap xl:h-8 rounded-md border border-rule bg-bg px-2 text-xs text-text-dim focus:border-accent-border focus:outline-none"
          >
            {vertical.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={addSource} disabled={saving}>
            <Plus size={13} />
            Add
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-text-faint">
          Must be a feed URL, not a homepage. Added sources grade REPORTED until
          you say otherwise.
        </p>
      </section>
    </div>
  );
}

/** Config calls every feed "rss"; the host is what distinguishes the channel. */
function platformForSource(source: SourceConfig): FeedPlatform {
  if (source.platform === 'reddit') return 'reddit';
  if (source.platform === 'youtube') return 'youtube';
  if (source.platform === 'linkedin') return 'linkedin';
  if (/substack\.com/i.test(source.url)) return 'substack';
  if (/(^|\/\/)(www\.)?(x|twitter)\.com/i.test(source.url)) return 'x';
  return 'rss';
}
