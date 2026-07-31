import { FEED_REQUEST_HEADERS } from './feed-headers';
import { canonicalUrl, fetchWithTimeout, hashString } from '@/lib/utils';
import type { RawItem } from './rss';

/**
 * EPA UIC Class VI permit tracker.
 *
 * EPA publishes no feed for Class VI — every RSS endpoint on epa.gov either
 * 404s or returns an empty 202 (probed three times, 2026-07-31). What it does
 * publish is the authoritative record itself, in two forms:
 *
 *   · A Qlik Sense dashboard embedded from awsedap.epa.gov. Qlik's Engine API
 *     is a stateful WebSocket protocol — not something to drive from a
 *     serverless function on a cron.
 *   · A PDF snapshot of the same tracker, linked from the same page, whose
 *     filename carries its publication date:
 *       .../documents/2026-05/permit-tracker_5-22-26.pdf
 *
 * The PDF is the better target, and deliberately it is NOT parsed. Extracting
 * per-well rows would mean a PDF library and a layout that EPA can change
 * without warning, producing silently wrong permit data — worse than none,
 * because it would carry VERIFIED tier. Instead this detects that a NEW
 * tracker has been published and links to it. "EPA refreshed the Class VI
 * tracker" is the actionable signal; the document is the detail.
 *
 * The URL is discovered by scraping the parent page rather than hardcoded,
 * because the date is in the path and a pinned URL would freeze on one
 * revision forever.
 */

const TRACKER_PAGE =
  'https://www.epa.gov/uic/current-class-vi-projects-under-review-epa';

/** States with Class VI primacy — EPA's tracker does NOT cover wells here. */
export const PRIMACY_STATES = [
  { state: 'ND', name: 'North Dakota', url: 'https://www.dmr.nd.gov/dmr/oilgas/classvi' },
  {
    state: 'TX',
    name: 'Texas',
    url: 'https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/co2-storage/',
  },
  {
    state: 'WV',
    name: 'West Virginia',
    url: 'https://dep.wv.gov/WWE/PERMIT/UIC/Pages/default.aspx',
  },
  {
    state: 'WY',
    name: 'Wyoming',
    url: 'https://deq.wyoming.gov/water-quality/groundwater/uic/class-vi/',
  },
] as const;

export interface TrackerSnapshot {
  /** Absolute URL of the current tracker PDF. */
  url: string;
  /** Publication date parsed from the filename, ISO, or null if unparseable. */
  publishedAt: string | null;
  /** Human label, e.g. "5-22-26". */
  revision: string;
}

/**
 * Filenames seen as permit-tracker_5-22-26.pdf — M-D-YY. Two-digit years are
 * read as 2000s: this document did not exist before 2022 and the program will
 * not outlive the century.
 */
function parseRevisionDate(revision: string): string | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(revision);
  if (!m) return null;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Find the current tracker PDF on EPA's page. Returns null if it moved. */
export async function findTracker(): Promise<TrackerSnapshot | null> {
  const res = await fetchWithTimeout(
    TRACKER_PAGE,
    { headers: FEED_REQUEST_HEADERS, redirect: 'follow' },
    15000,
  );
  if (!res.ok) return null;

  const html = await res.text();
  const match = /href=["']([^"']*permit-tracker[^"']*\.pdf)["']/i.exec(html);
  if (!match) return null;

  const href = match[1].replace(/&amp;/g, '&');
  const url = href.startsWith('http') ? href : new URL(href, 'https://www.epa.gov').toString();

  const revision =
    /permit-tracker[_-]([0-9-]+)\.pdf/i.exec(url)?.[1] ?? 'unknown';

  return { url, revision, publishedAt: parseRevisionDate(revision) };
}

/**
 * One RawItem when EPA has a tracker published, otherwise none.
 *
 * Dedupe is by URL hash like every other source, so a revision already seen
 * collapses on insert and only a genuinely new PDF surfaces. That is the whole
 * change-detection mechanism — no extra state to keep.
 */
export async function fetchEpaClassVi(): Promise<RawItem[]> {
  let snapshot: TrackerSnapshot | null = null;
  try {
    snapshot = await findTracker();
  } catch {
    // A dead scrape must never fail a sweep — same contract as fetchSource.
    return [];
  }
  if (!snapshot) return [];

  const url = canonicalUrl(snapshot.url);
  const dateLabel = snapshot.publishedAt
    ? new Date(snapshot.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : snapshot.revision;

  return [
    {
      key: hashString(url),
      title: `EPA published an updated Class VI permit tracker (${dateLabel})`,
      url,
      summary:
        'EPA refreshed the UIC Class VI permit tracker, the authoritative record of ' +
        'geologic sequestration well applications under federal review — including ' +
        'applicant, location and where each sits in the permitting queue. ' +
        `Note that ${PRIMACY_STATES.map((s) => s.name).join(', ')} hold Class VI ` +
        'primacy, so wells in those states are permitted by the state and do not ' +
        'appear here.',
      content: '',
      byline: 'US Environmental Protection Agency',
      imageUrl: null,
      publishedAt: snapshot.publishedAt,
      sourceId: 'epa-class-vi-tracker',
      sourceName: 'EPA UIC Class VI Permit Tracker',
      category: 'ccus',
      platform: 'manual',
      // Primary source: the agency's own record of its own permitting queue.
      defaultTier: 'verified',
      role: 'core',
    },
  ];
}
