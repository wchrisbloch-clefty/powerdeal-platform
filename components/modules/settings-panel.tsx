'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Download, Plus, X } from 'lucide-react';
import type { UserSettings } from '@/lib/types';
import type { EnvStatus } from '@/lib/env-check';
import { POWERDEAL_VERSION } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import Button from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import AgentHealth from './agent-health';
import UsageReport from './usage-report';
import SpineExport from './spine-export';
import SourcesPanel from './sources-panel';
import type { VerticalConfig } from '@/lib/verticals/types';
import PageHeader from '@/components/chrome/page-header';

const DEFAULTS: Required<Pick<UserSettings, 'watchlist'>> = {
  watchlist: { accounts: [], topics: [], verticals: [], utilities: [] },
};

export default function SettingsPanel({
  settings,
  env,
  brainReady,
  brainError,
  canPersist,
  vertical,
}: {
  settings: UserSettings | null;
  env: EnvStatus;
  brainReady: boolean;
  brainError: string | null;
  /**
   * Whether writes will survive. Formerly `signedIn`; sign-in was removed, so
   * persistence now depends on the service-role key being configured rather
   * than on a session.
   */
  canPersist: boolean;
  /** For the source list, which moved here from Intelligence. */
  vertical: VerticalConfig;
}) {
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

  const [newTopic, setNewTopic] = useState('');
  const [newUtility, setNewUtility] = useState('');

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
          // source_prefs deliberately absent: Intelligence › Sources owns it.
          // The PATCH schema is partial, and sending this panel's stale copy
          // would silently undo source changes made there.
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


  return (
    <div className="space-y-rhythm-page">
      <PageHeader eyebrow="Customization" title="Settings"
        action={
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saved ? <Check size={14} /> : null}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </Button>
        }
      />

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

      {/* ── Agent health ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Scheduled jobs</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              A cron that dies quietly is worse than no cron. This is the only
              place that will tell you one stopped.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <AgentHealth />
        </CardBody>
      </Card>

      {/* ── Sources ──
          MOVED HERE FROM INTELLIGENCE at the nav rebuild. It was the only
          configuration screen in a row of reading surfaces — a category error
          rather than a usage question, so it did not need a week of open
          counts to resolve. Video and Research stayed, because whether a
          reference surface is dead is exactly what open counts answer. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sources</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              Which feeds and channels the sweep reads. Configuration, not a
              reading surface — which is why it lives here rather than beside
              the intelligence it produces.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <SourcesPanel vertical={vertical} settings={settings} canPersist={canPersist} />
        </CardBody>
      </Card>

      {/* ── Spine export ──
          The pinned Pipeline-Spine.md had already drifted: one account at 6/10 health
          against a database computing 4 after the critical-event cap. A
          hand-maintained copy of a computed number is wrong from the first
          time the computation changes. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pipeline Spine export</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              The current pipeline as markdown, for re-pinning in the Claude project.
              Every figure is computed at export time and the file says when.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <SpineExport />
        </CardBody>
      </Card>

      {/* ── The usage week ──
          Read at the END of the week, not during it. Recollection remembers
          what was interesting rather than what was used, cannot see absence at
          all, and loses the thought at the moment of friction. This records
          all three. No score, no engagement index — one operator over one week
          cannot produce a denominator, and a derived number would read as a
          finding anyway. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>The week, as recorded</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              Which surfaces you actually opened, which you never did, and every
              &ldquo;I wish it just&hellip;&rdquo; captured where it happened.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <UsageReport />
        </CardBody>
      </Card>

      {/*
        Source management moved to Intelligence › Sources.

        It was two levels away from the feed it curates, and it covered only
        RSS — the social sources were configured nowhere at all. Choosing a
        channel is the same decision whether it is a publisher feed or a
        subreddit, so both now live together next to the stream they feed.
      */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sources</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              Curation moved next to the feed it curates.
            </p>
          </div>
          <Link
            href="/app/intelligence?tab=sources"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rule px-2.5 text-xs text-text-dim transition-colors hover:border-accent-border hover:text-text"
          >
            Open Sources
          </Link>
        </CardHeader>
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
              <label key={key} className="flex min-h-tap cursor-pointer items-center gap-2 text-sm lg:min-h-0">
                <input
                  type="checkbox"
                  checked={notify[key]}
                  onChange={(e) => setNotify((n) => ({ ...n, [key]: e.target.checked }))}
                  className="h-5 w-5 accent-[color:var(--color-accent-mark)] xl:h-3.5 xl:w-3.5"
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
  'h-tap xl:h-8 rounded-md border border-rule bg-bg-raised px-2.5 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none';

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
