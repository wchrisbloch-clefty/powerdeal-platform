'use client';

import { useState } from 'react';
import {
  BookOpen, DollarSign, Download, FileText, Map as MapIcon,
  Presentation, Send, Sparkles,
} from 'lucide-react';
import type { Deal } from '@/lib/types';
import type { TaskKind } from '@/lib/engine/model-routing';
import { useAiStream } from '@/lib/use-ai-stream';
import { AUDIENCE_PERSONAS } from '@/lib/prompts/modules/shared';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/button';
import AiOutput from '@/components/ui/ai-output';
import type { ForgeFormat } from '@/lib/forge/generate';

interface ForgeAction {
  id: string;
  label: string;
  description: string;
  task: TaskKind;
  formats: ForgeFormat[];
  icon: typeof FileText;
  /** Built from the deal record directly — no AI pass needed. */
  dataOnly?: boolean;
}

const FORGE_ACTIONS: ForgeAction[] = [
  {
    id: 'brief',
    label: 'Executive Account Brief',
    description: '~2 pages, exec-level, audience-calibrated',
    task: 'brief',
    formats: ['docx', 'md'],
    icon: FileText,
  },
  {
    id: 'plan',
    label: 'Account Plan Summary',
    description: 'Deep playbook, full methodology',
    task: 'plan',
    formats: ['docx', 'md'],
    icon: BookOpen,
  },
  {
    id: 'map',
    label: 'Mutual Action Plan',
    description: '5-phase MAP, owner-coded, Critical Event flagged',
    task: 'map-gen',
    formats: ['docx', 'md'],
    icon: MapIcon,
  },
  {
    id: 'outreach',
    label: 'Account Outreach Plan',
    description: 'Pain-ranked, channel-specific, touch sequence',
    task: 'outreach',
    formats: ['md', 'docx'],
    icon: Send,
  },
  {
    id: 'deck',
    label: 'Pitch Deck',
    description: 'Bloom-branded PPTX, audience-calibrated',
    task: 'brief',
    formats: ['pptx'],
    icon: Presentation,
  },
  {
    id: 'proforma',
    label: 'Pro Forma / Economic Model',
    description: 'Formula-driven workbook. Assumptions left blank by design.',
    task: 'forge-doc',
    formats: ['xlsx'],
    icon: DollarSign,
    dataOnly: true,
  },
];

export default function ForgePanel({
  deals,
  brainReady,
  brainError,
  aiAvailable,
  initialDealId,
}: {
  deals: Deal[];
  brainReady: boolean;
  brainError: string | null;
  aiAvailable: boolean;
  initialDealId?: string;
}) {
  const [dealId, setDealId] = useState(initialDealId ?? deals[0]?.id ?? '');
  const [actionId, setActionId] = useState('brief');
  const [persona, setPersona] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const ai = useAiStream();

  const deal = deals.find((d) => d.id === dealId) ?? null;
  const action = FORGE_ACTIONS.find((a) => a.id === actionId) ?? FORGE_ACTIONS[0];
  const blocked = !brainReady || !aiAvailable;

  async function generate() {
    if (!deal) return;
    setDownloadError(null);
    await ai.run({
      task: action.task,
      dealId: deal.id,
      audiencePersona: persona || undefined,
    });
  }

  async function download(format: ForgeFormat) {
    if (!deal) return;
    setDownloading(true);
    setDownloadError(null);

    try {
      const res = await fetch('/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: deal.id,
          action: action.id,
          format,
          content: ai.text,
          title: `${deal.company} — ${action.label}`,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers
          .get('content-disposition')
          ?.match(/filename="(.+?)"/)?.[1] ?? `${action.id}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setDownloading(false);
    }
  }

  const canDownload = action.dataOnly || Boolean(ai.text && !ai.streaming);

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Document Forge</p>
        <h1 className="mt-1 font-display text-2xl text-text">Forge</h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── Left: selector ── */}
        <div className="space-y-4">
          <div className="rounded-card border border-rule bg-bg-raised p-3">
            <label className="eyebrow mb-1.5 block">Account</label>
            <select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              className="h-tap xl:h-9 w-full rounded-md border border-rule bg-bg px-2.5 text-sm text-text focus:border-accent-border focus:outline-none"
            >
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deal_id} · {d.company}
                </option>
              ))}
            </select>

            <label className="eyebrow mb-1.5 mt-3 block">Audience</label>
            <select
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="h-tap xl:h-9 w-full rounded-md border border-rule bg-bg px-2.5 text-sm text-text focus:border-accent-border focus:outline-none"
            >
              <option value="">Not calibrated</option>
              {AUDIENCE_PERSONAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <p className="mt-1.5 text-2xs text-text-faint">
              Reorders the argument for the reader. Never changes the facts.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="eyebrow">Document type</p>
            {FORGE_ACTIONS.map((a) => {
              const Icon = a.icon;
              const active = a.id === actionId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setActionId(a.id);
                    ai.reset();
                    setDownloadError(null);
                  }}
                  className={cn(
                    'w-full rounded-card border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-accent-border bg-accent-bg'
                      : 'border-rule bg-bg-raised hover:bg-bg-overlay',
                  )}
                >
                  <span className="flex min-h-tap items-center gap-2 text-sm xl:min-h-0 font-medium text-text">
                    <Icon size={14} strokeWidth={1.75} />
                    {a.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-dim">
                    {a.description}
                  </span>
                  <span className="mt-1 block font-mono text-2xs uppercase tracking-wider text-text-faint">
                    {a.formats.join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: generate + preview ── */}
        <div className="space-y-3">
          {blocked && !action.dataOnly ? (
            <div className="rounded-card border border-rule bg-bg-raised p-4">
              <p className="font-display text-base text-text">
                {!aiAvailable ? 'AI key required' : 'PowerDeal brain not synced'}
              </p>
              <p className="mt-1.5 text-sm text-text-dim">
                {!aiAvailable
                  ? 'Set ANTHROPIC_API_KEY to generate documents.'
                  : (brainError ?? 'Sync the system prompt to generate documents.')}
              </p>
              <p className="mt-2 text-sm text-text-dim">
                The Pro Forma workbook still works — it is built from the deal record,
                not generated.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!action.dataOnly && (
              <Button
                variant="primary"
                onClick={generate}
                disabled={blocked || ai.streaming || !deal}
              >
                <Sparkles size={14} />
                {ai.streaming ? 'Generating…' : ai.text ? 'Regenerate' : 'Generate'}
              </Button>
            )}

            {action.formats.map((f) => (
              <Button
                key={f}
                variant={action.dataOnly ? 'primary' : 'secondary'}
                onClick={() => download(f)}
                disabled={downloading || !canDownload || !deal}
                title={
                  !canDownload ? 'Generate the document first' : `Download .${f}`
                }
              >
                <Download size={14} /> {f.toUpperCase()}
              </Button>
            ))}
          </div>

          {downloadError ? (
            <p className="text-sm text-danger" role="alert">{downloadError}</p>
          ) : null}

          {action.dataOnly ? (
            <div className="rounded-card border border-rule bg-bg-raised p-4">
              <p className="text-sm text-text">
                The pro forma ships the model, not the numbers.
              </p>
              <p className="mt-1.5 text-sm text-text-dim">
                Every assumption cell — system size, capacity factor, blended rate,
                escalation, PPA rate, term — is blank and highlighted. The formulas
                compute once you fill in verified figures. A workbook pre-filled with
                plausible-looking economics is the artifact most likely to reach a
                customer with invented numbers in it.
              </p>
            </div>
          ) : (
            <AiOutput
              text={ai.text}
              streaming={ai.streaming}
              error={ai.error}
              provider={ai.provider}
              model={ai.model}
              onStop={ai.stop}
              emptyHint={`Hit Generate to build the ${action.label.toLowerCase()} for ${deal?.company ?? 'this account'}.`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
