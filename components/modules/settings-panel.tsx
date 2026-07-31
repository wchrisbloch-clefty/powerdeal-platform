'use client';

import { useState } from 'react';
import { Check, Download, Plus, X } from 'lucide-react';
import type { UserSettings, SourceTier, CustomSource } from '@/lib/types';
import type { VerticalConfig } from '@/lib/verticals/types';
import type { EnvStatus } from '@/lib/env-check';
import { POWERDEAL_VERSION } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import Button from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import ProvenanceChip from '@/components/ui/provenance-chip';

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

const DEFAULTS: Required<Pick<UserSettings, 'source_prefs' | 'watchlist'>> = {
  source_prefs: { muted: [], enabled: [], order: [], custom: [] },
  watchlist: { accounts: [], topics: [], verticals: [], utilities: [] },
};

export default function SettingsPanel({
  settings,
  vertical,
  env,
  brainReady,
  brainError,
  canPersist,
}: {
  settings: UserSettings | null;
  vertical: VerticalConfig;
  env: EnvStatus;
  brainReady: boolean;
  brainError: string | null;
  /**
   * Whether writes will survive. Formerly `signedIn`; sign-in was removed, so
   * persistence now depends on the service-role key being configured rather
   * than on a session.
   */
  canPersist: boolean;
}) {
  const [prefs, setPrefs] = useState(settings?.source_prefs ?? DEFAULTS.source_prefs);
  const [watchlist, setWatchlist] = useState(settings?.watchlist ?? DEFAULTS.watchlist);
  const [density, setDensity] = useState(settings?.display_density ?? 'comfortable');
  const [mapLayer, setMapLayer] = useState(settings?.default_map_layer ?? 'non-attainment');
  const [notify, setNotify] = useState({
    market_watch: settings?.notify_market_watch ?? true,
    stall_alert: settings?.notify_stall_alert ?? true,
    weekly_recap: settings?.notify_weekly_recap ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSource, setNewSource] = useState({ name: '', url: '', category: 'power-markets' });
  const [newTopic, setNewTopic] = useState('');
  const [newUtility, setNewUtility] = useState('');

  const [health, setHealth] = useState<SourceHealthReport | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkSources() {
    setChecking(true);
    try {
      const res = await fetch('/api/feed/health');
      setHealth((await res.json()) as SourceHealthReport);
    } catch {
      setError('Could not reach the source health check.');
    } finally {
      setChecking(false);
    }
  }

  const healthById = new Map(health?.sources.map((s) => [s.id, s]) ?? []);

  async function save() {
    if (!canPersist) {
      setError(
        'Supabase is not configured, so settings cannot be saved. Changes here are session-only.',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_prefs: prefs,
          watchlist,
          display_density: density,
          default_map_layer: mapLayer,
          notify_market_watch: notify.market_watch,
          notify_stall_alert: notify.stall_alert,
          notify_weekly_recap: notify.weekly_recap,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  function toggleSource(id: string, isDiscovery: boolean) {
    setPrefs((p) => {
      if (isDiscovery) {
        // Discovery is opt-in — presence in `enabled` is the switch.
        const on = p.enabled.includes(id);
        return {
          ...p,
          enabled: on ? p.enabled.filter((s) => s !== id) : [...p.enabled, id],
        };
      }
      // Core is opt-out — presence in `muted` is the switch.
      const muted = p.muted.includes(id);
      return { ...p, muted: muted ? p.muted.filter((s) => s !== id) : [...p.muted, id] };
    });
  }

  function addCustomSource() {
    if (!newSource.name.trim() || !newSource.url.trim()) return;
    try {
      new URL(newSource.url);
    } catch {
      setError('Custom source URL is not valid.');
      return;
    }
    const source: CustomSource = {
      id: `custom-${newSource.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: newSource.name.trim(),
      url: newSource.url.trim(),
      category: newSource.category,
      // A user-added feed is REPORTED at best — we have not vetted it.
      defaultTier: 'reported' as SourceTier,
    };
    setPrefs((p) => ({ ...p, custom: [...p.custom, source] }));
    setNewSource({ name: '', url: '', category: 'power-markets' });
    setError(null);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Customization</p>
          <h1 className="mt-1 font-display text-2xl text-text">Settings</h1>
        </div>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          {saved ? <Check size={14} /> : null}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </Button>
      </header>

      {!canPersist && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-text-dim">
          Supabase is not configured — changes here apply to this session only and
          will not persist.
        </p>
      )}
      {error && (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {/* ── Status ── */}
      <Card>
        <CardHeader><CardTitle>Status</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-dim">PowerDeal brain</span>
            {brainReady ? (
              <Badge tone="success">v{POWERDEAL_VERSION} synced</Badge>
            ) : (
              <Badge tone="danger">Not synced</Badge>
            )}
          </div>
          {!brainReady && (
            <p className="text-xs text-text-dim">
              {brainError}
              <br />
              Domain reasoning (brief, plan, qualify, MAP, outreach, chat) is disabled
              until the real prompt replaces the placeholder. Every other feature works.
            </p>
          )}

          <div className="grid gap-1.5 border-t border-rule pt-3 sm:grid-cols-2">
            {(
              [
                ['Supabase', env.supabase, 'Persistence and auth'],
                ['Anthropic', env.anthropic, 'Domain reasoning'],
                ['Groq', env.groq, 'Fast feed summaries'],
                ['Gemini', env.gemini, 'Mid-tier fallback'],
                ['EIA', env.eia, 'Rate data'],
                ['PowerOutage.us', env.poweroutage, 'Live outage layer'],
                ['YouTube', env.youtube, 'Video transcripts'],
              ] as [string, boolean, string][]
            ).map(([name, ok, purpose]) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-success' : 'bg-rule')}
                />
                <span className={ok ? 'text-text' : 'text-text-faint'}>{name}</span>
                <span className="text-text-faint">— {purpose}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ── Sources ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Source management</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              Core sources feed the Intelligence page. Discovery nets never do — they
              only surface what your core sources missed.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={checkSources} disabled={checking}>
            {checking ? 'Checking…' : 'Check all feeds'}
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {/* Publisher feed URLs move. A dead source otherwise just makes the
              feed quieter, with nothing to tell you why. */}
          {health && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                health.broken === 0
                  ? 'border-accent-border bg-accent-bg text-accent-dim'
                  : 'border-rule bg-bg text-text',
              )}
            >
              {health.broken === 0 ? (
                <>All {health.ok} feeds responded with items.</>
              ) : (
                <>
                  <strong>{health.broken}</strong> of {health.checked} feeds are not
                  returning items. Fix the URL in{' '}
                  <span className="font-mono text-xs">lib/verticals/powerdeal.ts</span>,
                  or mute the source below.
                </>
              )}
            </div>
          )}

          <div>
            <p className="eyebrow mb-2">Core sources ({vertical.sources.length})</p>
            <div className="space-y-1.5">
              {vertical.sources.map((s) => {
                const on = !prefs.muted.includes(s.id);
                const h = healthById.get(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-bg-overlay"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSource(s.id, false)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-[color:var(--color-accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('text-sm', on ? 'text-text' : 'text-text-faint')}>
                          {s.name}
                        </span>
                        <ProvenanceChip tier={s.defaultTier} />
                        {h ? (
                          <Badge tone={h.status === 'ok' ? 'success' : 'danger'}>
                            {h.status === 'ok' ? `${h.itemCount} items` : (h.httpStatus ?? 'error')}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-dim">{s.rationale}</span>
                      {h?.message ? (
                        <span className="mt-0.5 block text-xs text-danger">{h.message}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t border-rule pt-3">
            <p className="eyebrow mb-2">Discovery nets ({vertical.discovery.length})</p>
            <div className="space-y-1.5">
              {vertical.discovery.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-bg-overlay"
                >
                  <input
                    type="checkbox"
                    checked={prefs.enabled.includes(s.id)}
                    onChange={() => toggleSource(s.id, true)}
                    className="mt-1 h-3.5 w-3.5 shrink-0 accent-[color:var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-text">{s.name}</span>
                      <ProvenanceChip tier="inferred" />
                    </span>
                    <span className="mt-0.5 block text-xs text-text-dim">{s.rationale}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-rule pt-3">
            <p className="eyebrow mb-2">Custom sources</p>
            {prefs.custom.length > 0 && (
              <ul className="mb-2.5 space-y-1.5">
                {prefs.custom.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border border-rule px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">{c.name}</span>
                      <span className="block truncate text-xs text-text-faint">{c.url}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() =>
                        setPrefs((p) => ({
                          ...p,
                          custom: p.custom.filter((s) => s.id !== c.id),
                        }))
                      }
                      className="rounded p-1 text-text-dim hover:text-danger"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                value={newSource.name}
                onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))}
                placeholder="Source name"
                className={cn(inputClass, 'min-w-[130px] flex-1')}
              />
              <input
                value={newSource.url}
                onChange={(e) => setNewSource((s) => ({ ...s, url: e.target.value }))}
                placeholder="https://example.com/feed"
                className={cn(inputClass, 'min-w-[180px] flex-[2]')}
              />
              <select
                value={newSource.category}
                onChange={(e) => setNewSource((s) => ({ ...s, category: e.target.value }))}
                className={inputClass}
              >
                {vertical.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={addCustomSource}>
                <Plus size={13} /> Add
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-text-faint">
              Custom feeds are graded REPORTED — we have not vetted them as primary
              sources.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* ── Watchlist ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Watchlist</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              Drives the discovery nets, video search, and market watch sweeps.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <TagEditor
            label="Topics"
            values={watchlist.topics}
            value={newTopic}
            onValue={setNewTopic}
            onAdd={(v) => setWatchlist((w) => ({ ...w, topics: [...w.topics, v] }))}
            onRemove={(v) =>
              setWatchlist((w) => ({ ...w, topics: w.topics.filter((t) => t !== v) }))
            }
            placeholder="SOFC, ERCOT, Class VI…"
          />
          <TagEditor
            label="Utility territories"
            values={watchlist.utilities}
            value={newUtility}
            onValue={setNewUtility}
            onAdd={(v) => setWatchlist((w) => ({ ...w, utilities: [...w.utilities, v] }))}
            onRemove={(v) =>
              setWatchlist((w) => ({ ...w, utilities: w.utilities.filter((t) => t !== v) }))
            }
            placeholder="CenterPoint, Dominion…"
          />
        </CardBody>
      </Card>

      {/* ── Display, map, notifications ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Display</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <label className="block">
              <span className="eyebrow mb-1 block">Density</span>
              <select
                value={density}
                onChange={(e) =>
                  setDensity(e.target.value as UserSettings['display_density'])
                }
                className={cn(inputClass, 'w-full')}
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
            <label className="block">
              <span className="eyebrow mb-1 block">Default map layer</span>
              <select
                value={mapLayer}
                onChange={(e) => setMapLayer(e.target.value)}
                className={cn(inputClass, 'w-full')}
              >
                <option value="non-attainment">EPA Non-Attainment</option>
                <option value="class-vi-wells">Class VI Wells</option>
                <option value="rto-regions">RTO / ISO Regions</option>
                <option value="ng-pipelines">Natural Gas Pipelines</option>
              </select>
            </label>
            <p className="text-xs text-text-faint">
              Theme is set with the toggle in the top bar and stored on this device.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(
              [
                ['market_watch', 'Market Watch sweep (Friday)'],
                ['stall_alert', 'Deal stall alerts (daily)'],
                ['weekly_recap', 'Weekly recap'],
              ] as [keyof typeof notify, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={notify[key]}
                  onChange={(e) => setNotify((n) => ({ ...n, [key]: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
                />
                <span className="text-text-dim">{label}</span>
              </label>
            ))}
            <p className="pt-1 text-xs text-text-faint">
              These control what the scheduled edge functions write. Deploy them from
              supabase/functions/ for the schedules to run.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* ── Export ── */}
      <Card>
        <CardHeader><CardTitle>Export</CardTitle></CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          <a href="/api/deals/export" download>
            <Button variant="secondary" size="sm">
              <Download size={14} /> Pipeline (CSV)
            </Button>
          </a>
          <a href="/api/signals?limit=200" download="powerdeal-intelligence.json">
            <Button variant="secondary" size="sm">
              <Download size={14} /> Intelligence log (JSON)
            </Button>
          </a>
        </CardBody>
      </Card>
    </div>
  );
}

const inputClass =
  'h-8 rounded-md border border-rule bg-bg-raised px-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none';

function TagEditor({
  label,
  values,
  value,
  onValue,
  onAdd,
  onRemove,
  placeholder,
}: {
  label: string;
  values: string[];
  value: string;
  onValue: (v: string) => void;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  function add() {
    const v = value.trim();
    if (!v || values.includes(v)) return;
    onAdd(v);
    onValue('');
  }

  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-xs text-text-faint">None set.</span>
        ) : (
          values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-accent-border bg-accent-bg px-2 py-0.5 text-xs text-accent-dim"
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onRemove(v)}
                className="hover:text-danger"
              >
                <X size={11} />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={cn(inputClass, 'flex-1')}
        />
        <Button variant="secondary" size="sm" onClick={add}>
          <Plus size={13} />
        </Button>
      </div>
    </div>
  );
}
