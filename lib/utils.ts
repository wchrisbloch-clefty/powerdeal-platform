import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge, taught our custom scale names.
 *
 * Without this it cannot tell `text-note` (a font size) from `text-accent-fg`
 * (a colour) — both are `text-*` and neither is in its default theme — so it
 * treats them as one conflicting group and silently drops whichever came
 * first. That is not theoretical: it was deleting `text-accent-fg` from the
 * primary button, leaving the label to inherit body colour and render pale
 * grey on Bloom green at 1.98:1.
 *
 * Any new custom fontSize or colour token added to tailwind.config.ts has to be
 * declared here too, or it will start losing merges the same way.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Only '2xs' is a NEW font-size name — the rest of the scale reuses
      // Tailwind's own names, which tailwind-merge already classifies.
      'font-size': [{ text: ['2xs'] }],
      'text-color': [
        {
          text: [
            'accent-fg', 'accent-dim', 'text', 'text-dim', 'text-faint',
            'health-high', 'health-mid', 'health-low',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Stable non-cryptographic hash — used for cache keys and dedupe by URL. */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Normalize a URL for dedupe: drop tracking params, trailing slash, hash. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const strip = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source',
    ];
    strip.forEach((p) => u.searchParams.delete(p));
    u.hash = '';
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return raw.trim();
  }
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function relativeTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

/** US$ — the platform's default currency, per the PowerDeal operating rules. */
export function formatUsd(millions?: number | null): string {
  if (millions === null || millions === undefined || Number.isNaN(millions)) return '—';
  if (millions >= 1000) return `$${(millions / 1000).toFixed(1)}B`;
  if (millions < 1) return `$${Math.round(millions * 1000)}K`;
  return `$${millions.toFixed(1)}M`;
}

export function formatMw(mw?: number | null): string {
  if (mw === null || mw === undefined || Number.isNaN(mw)) return '—';
  return `${mw % 1 === 0 ? mw.toFixed(0) : mw.toFixed(1)} MW`;
}

export function pct(value: number, digits = 1): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Escape a value for CSV export (RFC 4180). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = Array.isArray(value) ? value.join('; ') : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const head = columns.map(csvCell).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\r\n');
  return `${head}\r\n${body}`;
}

export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Fetch with a hard timeout — external data APIs must never hang a request. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
