import { FEED_REQUEST_HEADERS } from './feed-headers';
import { canonicalUrl, fetchWithTimeout, hashString } from '@/lib/utils';
import type { RawItem } from './rss';

/**
 * Class VI permit trackers, federal and state.
 *
 * Neither EPA nor the primacy states publish a feed for Class VI. What both
 * EPA and Texas do publish is a dated PDF of the current application list,
 * linked from a stable page, with the date in the filename:
 *
 *   EPA   .../documents/2026-05/permit-tracker_5-22-26.pdf
 *   Texas .../media/nqfpn5xe/class_vi_application-07262026.pdf
 *
 * So one mechanism covers both: find the newest dated document on the page,
 * and treat a new date as the signal.
 *
 * The PDFs are deliberately NOT parsed. Extracting per-well rows would need a
 * PDF library and a layout either agency can change without warning, and the
 * failure mode would be silently wrong permit data carrying VERIFIED tier —
 * strictly worse than no data. "Texas refreshed its Class VI application
 * list" is the actionable signal; the document is the detail.
 *
 * WHY STATES MATTER HERE: North Dakota, Texas, West Virginia and Wyoming hold
 * Class VI primacy, so they permit their own wells and those never appear in
 * EPA's tracker. Covering EPA alone would silently miss every Texas well.
 */

interface TrackerConfig {
  id: string;
  /** Agency name as it should read in the feed. */
  agency: string;
  /** Jurisdiction label — 'Federal' or a state code. */
  jurisdiction: string;
  /** Page carrying the link. Stable; the document URL is not. */
  page: string;
  /** Matches candidate document hrefs. */
  pattern: RegExp;
  /** Pulls the date string out of a matched href. */
  datePattern: RegExp;
}

const TRACKERS: TrackerConfig[] = [
  {
    id: 'epa-class-vi-tracker',
    agency: 'US Environmental Protection Agency',
    jurisdiction: 'Federal',
    page: 'https://www.epa.gov/uic/current-class-vi-projects-under-review-epa',
    pattern: /permit-tracker[^"']*\.pdf/i,
    datePattern: /permit-tracker[_-]([0-9-]+)\.pdf/i,
  },
  {
    id: 'tx-rrc-class-vi',
    agency: 'Texas Railroad Commission',
    jurisdiction: 'TX',
    page: 'https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/co2-storage/',
    // Both class_vi_application-*.pdf and class-vi-application-list-*.pdf are
    // in use; the page keeps superseded lists alongside the current one, which
    // is why the newest date wins rather than the first match.
    pattern: /class[_-]vi[_-]application[^"']*\.pdf/i,
    datePattern: /class[_-]vi[_-]application(?:[_-]list)?[_-]([0-9-]+)\.pdf/i,
  },
];

/** States holding Class VI primacy — absent from EPA's tracker by definition. */
export const PRIMACY_STATES = [
  {
    state: 'ND',
    name: 'North Dakota',
    url: 'https://www.dmr.nd.gov/dmr/oilgas/classvi',
    tracked: false,
    note: 'Reachable, but publishes no dated permit list — records are per-well pages.',
  },
  {
    state: 'TX',
    name: 'Texas',
    url: 'https://www.rrc.texas.gov/oil-and-gas/applications-and-permits/injection-storage-permits/co2-storage/',
    tracked: true,
    note: 'Dated Class VI application list PDF — tracked.',
  },
  {
    state: 'WV',
    name: 'West Virginia',
    url: 'https://dep.wv.gov/WWE/PERMIT/UIC/Pages/default.aspx',
    tracked: false,
    note: 'Non-mining UIC permits page carries a table but nothing Class VI-specific.',
  },
  {
    state: 'WY',
    name: 'Wyoming',
    url: 'https://deq.wyoming.gov/water-quality/groundwater/uic/class-vi/',
    tracked: false,
    note: 'No dated list. DEQ runs a Class VI listserv, which suits email-to-hub rather than scraping.',
  },
] as const;

export interface TrackerSnapshot {
  id: string;
  agency: string;
  jurisdiction: string;
  url: string;
  publishedAt: string | null;
  revision: string;
}

/**
 * Dates appear in filenames in several shapes, all seen live:
 *   5-22-26     EPA, M-D-YY
 *   07262026    Texas current, MMDDYYYY
 *   5122026     Texas, MDDYYYY
 *   31126       Texas superseded, MDDYY
 * Two-digit years read as 2000s — Class VI did not exist before 2010.
 */
function parseTrackerDate(raw: string): string | null {
  let mm: number;
  let dd: number;
  let yy: number;

  if (raw.includes('-')) {
    const parts = raw.split('-').filter(Boolean);
    if (parts.length !== 3) return null;
    [mm, dd, yy] = parts.map(Number);
  } else if (/^\d{5,8}$/.test(raw)) {
    // Year is always the trailing 2 or 4 digits; the rest splits M/D by length.
    const yearLen = raw.length >= 7 ? 4 : 2;
    const head = raw.slice(0, raw.length - yearLen);
    yy = Number(raw.slice(-yearLen));
    if (head.length === 4) {
      mm = Number(head.slice(0, 2));
      dd = Number(head.slice(2));
    } else if (head.length === 3) {
      mm = Number(head.slice(0, 1));
      dd = Number(head.slice(1));
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (Number.isNaN(mm) || Number.isNaN(dd) || Number.isNaN(yy)) return null;
  if (yy < 100) yy += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const date = new Date(Date.UTC(yy, mm - 1, dd));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Newest dated document on one agency's page, or null.
 *
 * Newest-wins rather than first-match because Texas keeps superseded lists on
 * the same page; taking the first link would pin the feed to whichever
 * revision happens to sit highest in the markup.
 */
async function findTrackerFor(cfg: TrackerConfig): Promise<TrackerSnapshot | null> {
  const res = await fetchWithTimeout(
    cfg.page,
    { headers: FEED_REQUEST_HEADERS, redirect: 'follow' },
    15000,
  );
  if (!res.ok) return null;

  const html = await res.text();
  const hrefs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((h) => cfg.pattern.test(h));

  const candidates: TrackerSnapshot[] = hrefs.map((href) => {
    const url = href.startsWith('http') ? href : new URL(href, cfg.page).toString();
    const revision = cfg.datePattern.exec(url)?.[1] ?? 'unknown';
    return {
      id: cfg.id,
      agency: cfg.agency,
      jurisdiction: cfg.jurisdiction,
      url,
      revision,
      publishedAt: parseTrackerDate(revision),
    };
  });

  if (candidates.length === 0) return null;

  const dated = candidates.filter((c) => c.publishedAt !== null);
  if (dated.length === 0) return candidates[0];

  return dated.reduce((newest, c) =>
    (c.publishedAt as string) > (newest.publishedAt as string) ? c : newest,
  );
}

/** Every tracker's current state. A failed agency is null, never a throw. */
export async function findAllTrackers(): Promise<(TrackerSnapshot | null)[]> {
  return Promise.all(TRACKERS.map((cfg) => findTrackerFor(cfg).catch(() => null)));
}

/**
 * One RawItem per agency that currently publishes a tracker.
 *
 * Dedupe is by URL hash like every other source, so a revision already seen
 * collapses on insert and only a genuinely new document surfaces. That is the
 * whole change-detection mechanism — no extra state to keep.
 */
export async function fetchClassViTrackers(): Promise<RawItem[]> {
  const snapshots = (await findAllTrackers()).filter(
    (s): s is TrackerSnapshot => s !== null,
  );

  const untracked = PRIMACY_STATES.filter((s) => !s.tracked).map((s) => s.name);

  return snapshots.map((snapshot) => {
    const url = canonicalUrl(snapshot.url);
    const dateLabel = snapshot.publishedAt
      ? new Date(snapshot.publishedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        })
      : snapshot.revision;

    const isFederal = snapshot.jurisdiction === 'Federal';
    const scope = isFederal
      ? 'Covers wells permitted by EPA only. ' +
        `${PRIMACY_STATES.map((s) => s.name).join(', ')} hold Class VI primacy ` +
        'and permit their own wells, so those do not appear here.'
      : `Covers ${snapshot.jurisdiction} wells, permitted by the state under ` +
        "Class VI primacy and absent from EPA's federal tracker.";

    return {
      key: hashString(url),
      title: `${snapshot.agency} published an updated Class VI permit list (${dateLabel})`,
      url,
      summary:
        `${snapshot.agency} refreshed its Class VI record of geologic sequestration ` +
        'well applications — applicant, location and position in the permitting ' +
        `queue. ${scope}` +
        (isFederal && untracked.length > 0
          ? ` No dated list is published by ${untracked.join(', ')}; those are not tracked.`
          : ''),
      content: '',
      byline: snapshot.agency,
      imageUrl: null,
      publishedAt: snapshot.publishedAt,
      sourceId: snapshot.id,
      sourceName: `${snapshot.agency} — Class VI tracker`,
      category: 'ccus',
      platform: 'manual',
      // Primary source: each agency's own record of its own permitting queue.
      defaultTier: 'verified',
      role: 'core',
    };
  });
}
