/**
 * ═══════════════════════════════════════════════════════════════
 * "NOTHING THERE" AND "COULDN'T LOOK" ARE DIFFERENT STATES.
 * ═══════════════════════════════════════════════════════════════
 *
 * They render identically everywhere they are not distinguished, and the
 * mistake is always in the same direction: a surface that could not read its
 * data shows the friendly empty state, and the operator concludes the pipeline
 * is quiet.
 *
 * This build has now produced that failure three times in three places:
 *   · `agents:runs` could not be written and six live jobs read "never run".
 *   · The sweep's cache lookup discarded its error, so a failed read produced
 *     an empty set and every item was treated as new.
 *   · `feed_items` had no `url_hash`, so every store failed and the feed
 *     rendered as "no items yet" for the entire life of the feature.
 *
 * Every one was a read that failed presenting as a read that found nothing.
 *
 * ══ AND A THIRD STATE THAT LOOKS LIKE CONTENT ══
 *
 * `seeded` is data the platform shipped with rather than data about this
 * operator's world. A seed row rendered in the same card as a swept row is a
 * placeholder that reads as a finding — the reader cannot tell demonstration
 * material from their own pipeline, and the first time they act on it is the
 * last time they trust the surface.
 *
 * ══ NOTHING GATES ══
 *
 * None of these states disables anything. `unreadable` does not blank a page,
 * `empty` does not hide a button, `seeded` does not refuse to render. They
 * change the SENTENCE the surface says about itself, nothing else.
 *
 * PURE. No fetch, no client, no JSX — so every branch is reachable from a test
 * and the copy cannot drift between the four places that render it.
 */

export type SeedState =
  /** The read failed. NOT the same as no data, and never rendered as such. */
  | { kind: 'unreadable'; reason: string }
  /** The read succeeded and there is genuinely nothing yet. */
  | { kind: 'empty' }
  /** Everything present came from the shipped seed, not from this operator. */
  | { kind: 'seeded'; count: number }
  /** Real data. */
  | { kind: 'populated'; count: number; seeded: number };

export interface SeedStateInput<T> {
  rows: T[] | null | undefined;
  /** The error a failed read returned. supabase-js RESOLVES with this. */
  error: { message: string } | string | null | undefined;
  /** True for a row that came from the shipped seed rather than the world. */
  isSeed?: (row: T) => boolean;
}

/**
 * Classify a read.
 *
 * ⚠️ THE ERROR IS CHECKED FIRST AND UNCONDITIONALLY. `supabase-js` resolves
 * with `{ data: null, error }` rather than throwing, so a caller that reaches
 * for `rows.length` gets 0 and never learns anything went wrong. Order matters
 * here more than anywhere else in this file.
 */
export function classifySeedState<T>(input: SeedStateInput<T>): SeedState {
  const { rows, error, isSeed } = input;

  if (error) {
    const reason = typeof error === 'string' ? error : error.message;
    return { kind: 'unreadable', reason: reason || 'The read failed without a message.' };
  }

  // A null row set with NO error is still not a successful empty read — it is
  // a query that returned nothing at all, which is a client-level failure.
  if (rows == null) {
    return {
      kind: 'unreadable',
      reason: 'The query returned neither rows nor an error, which should not happen.',
    };
  }

  if (rows.length === 0) return { kind: 'empty' };

  const seeded = isSeed ? rows.filter(isSeed).length : 0;
  if (seeded === rows.length) return { kind: 'seeded', count: seeded };

  return { kind: 'populated', count: rows.length, seeded };
}

export interface SeedCopy {
  /** The heading. Never "No data" for an unreadable state. */
  title: string;
  /** One sentence. Says what is true, including what is NOT known. */
  body: string;
  /**
   * How the surface should read it. `alert` is a fault; `quiet` is a genuine
   * empty; `caution` is content that is not the operator's own.
   */
  tone: 'alert' | 'quiet' | 'caution' | 'normal';
}

/**
 * The sentence each state says about itself.
 *
 * `subject` is the plural noun for what was being read — "swept items",
 * "deals", "trending entities". Written into the copy so one implementation
 * serves every surface without four near-identical strings drifting apart.
 */
export function describeSeedState(state: SeedState, subject: string): SeedCopy {
  switch (state.kind) {
    case 'unreadable':
      return {
        title: `Could not read ${subject}`,
        // Explicitly NOT "there are none". The distinction is the whole point.
        body:
          `This is not the same as having none — the query failed, so nothing is known ` +
          `either way. ${state.reason}`,
        tone: 'alert',
      };
    case 'empty':
      return {
        title: `No ${subject} yet`,
        body: `The read succeeded and there is genuinely nothing here yet.`,
        tone: 'quiet',
      };
    case 'seeded':
      return {
        title: `${state.count} seeded ${subject}`,
        body:
          `Everything here shipped with the platform as demonstration material. ` +
          `None of it describes your pipeline yet.`,
        tone: 'caution',
      };
    case 'populated':
      return {
        title: `${state.count} ${subject}`,
        body:
          state.seeded > 0
            ? `${state.seeded} of these are seeded demonstration rows, not your data.`
            : `All from your own data.`,
        tone: 'normal',
      };
  }
}

/** True when the surface should show its state instead of its content. */
export function shouldShowState(state: SeedState): boolean {
  return state.kind === 'unreadable' || state.kind === 'empty';
}

/**
 * Does this surface know what it is talking about?
 *
 * `false` ONLY for a failed read. An empty result is a fact about the world
 * and the surface is entitled to report it; a failed read is not.
 */
export function isTrustworthy(state: SeedState): boolean {
  return state.kind !== 'unreadable';
}

/**
 * ═══════════════════════════════════════════════════════════════
 * THE HEADLINES PAYLOAD — ONE TYPE, BOTH ENDS.
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ THIS EXISTS BECAUSE THE TWO ENDS DRIFTED AND TOOK A SURFACE DOWN.
 *
 * `/api/headlines` has an early return for the unconfigured case. It sent
 * `feed_state` and `deal_state` and omitted `feed_copy` and `deal_copy`. The
 * panel reads `data.feed_copy.title` precisely when the state is `unreadable`
 * — so with no `SUPABASE_SERVICE_ROLE_KEY`, the read that was supposed to
 * EXPLAIN the missing key instead threw `Cannot read properties of undefined`,
 * and the entire Intelligence tab rendered as a blank error page.
 *
 * The degraded path was the crashing path, which is the worst possible place
 * for it: a deployment with no keys is the state this product promises to
 * boot in, and Intelligence was simply gone.
 *
 * Nothing caught it. `NextResponse.json()` accepts any object, the panel
 * declared its own private `Response` interface, and the two agreed only by
 * hand. TypeScript had no reason to look.
 *
 * So the shape lives here and BOTH ends import it: the route annotates its
 * returns with it, the panel types its state with it. Omitting a field is now
 * a type error at the point of omission rather than a blank screen in
 * production.
 */
export interface HeadlinesPayload<H> {
  headlines: H[];
  summary: string | null;
  feed_state: SeedState;
  feed_copy: SeedCopy;
  deal_state: SeedState;
  deal_copy: SeedCopy;
  considered: number;
}
