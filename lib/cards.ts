import type { Deal, DealCompetitor } from '@/lib/types';

/**
 * COMPETITIVE CARDS — one card per posture.
 *
 * Not one card with a section per competitor. A pricing defense against the
 * grid argues "your rate escalates, you have no control, and no exit"; against
 * a packaged integrator it argues "the bundled price hides financing cost and
 * you cannot unbundle it later". Different claim, different evidence, and often
 * a different reader — the grid comparison goes to finance, the integrator
 * comparison to procurement. Sections would put two arguments in front of a
 * reader who needs one and invite them to skim to theirs.
 *
 * GENERATED ON DEMAND, never batched. Generating a card per posture upfront
 * rebuilds the maintained battlecard library this build deliberately abandoned:
 * artifacts that go stale the instant posture changes, with nothing on them
 * saying which is current. On demand means the card is always built from the
 * record as it stands when it is asked for.
 */

/**
 * The negative header. THE MOST IMPORTANT THING ON THE CARD.
 *
 * Built in CODE and prepended to the model's output, never written by the
 * model. A model-authored header can be omitted, reworded into something
 * weaker, or dropped when the output runs long — and the failure it prevents is
 * a rep carrying the integrator card into a meeting where the real threat is
 * do-nothing, with nothing on the page revealing the mismatch. That is this
 * build's recurring failure shape: an artifact that renders confidently and is
 * wrong in a way nothing visible discloses.
 *
 * It must also SURVIVE EXPORT. This is the export/app split inverted — that one
 * withheld internal messages from the customer-facing document; this one must
 * reach it. Asserted in tests/cards.test.ts against the generated OOXML.
 */
export function negativeHeader(opts: {
  addressing: string;
  others: string[];
  generatedOn: string;
}): string {
  const lines: string[] = [];

  lines.push(`**This card addresses: ${opts.addressing}.**`);

  if (opts.others.length > 0) {
    lines.push('');
    lines.push(
      `This deal also faces ${formatList(opts.others)}. Those need their own cards — the argument here does not transfer to them.`,
    );
  } else {
    lines.push('');
    lines.push(
      'No other competitor is on record for this deal. That is a gap in the record rather than a finding: if something else is in play and has not been logged, this card is arguing against the wrong opponent.',
    );
  }

  lines.push('');
  lines.push(`_Generated ${opts.generatedOn} from the deal record as it stood that day._`);
  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Filename carrying the posture and the date.
 *
 * Both are load-bearing. Two cards for the same deal in one downloads folder
 * have to be tellable apart, and the reader has to know which is newer, without
 * opening either. `williams-no-decision-2026-08-10.docx` answers both from the
 * file listing alone.
 */
export function cardFilename(
  deal: Pick<Deal, 'company'>,
  cardKind: 'no-decision' | 'pricing-defense',
  posture: string,
  date = new Date().toISOString().slice(0, 10),
): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug(deal.company)}-${cardKind}-vs-${slug(posture)}-${date}.docx`;
}

/** Human title for the card, used as the document title. */
export function cardTitle(
  deal: Pick<Deal, 'company'>,
  cardKind: 'no-decision' | 'pricing-defense',
  posture: string,
): string {
  const label = cardKind === 'no-decision' ? 'No-decision case' : 'Pricing defense';
  return `${deal.company} — ${label} vs ${posture}`;
}

/**
 * Assemble the finished card.
 *
 * The header is prepended here, after generation, so no prompt change and no
 * model behaviour can remove it.
 */
export function assembleCard(opts: {
  addressing: string;
  others: string[];
  body: string;
  generatedOn?: string;
}): string {
  return (
    negativeHeader({
      addressing: opts.addressing,
      others: opts.others,
      generatedOn: opts.generatedOn ?? new Date().toISOString().slice(0, 10),
    }) + opts.body
  );
}

/** The postures currently live on a deal, for the card picker. */
export function cardablePostures(
  competitors: DealCompetitor[],
): { key: string; label: string; tier: string }[] {
  return [
    { key: 'no-decision', label: 'Do nothing', tier: 'tier-1' },
    ...competitors
      .filter((c) => c.status === 'active')
      .map((c) => ({ key: c.id, label: c.competitor, tier: c.tier })),
  ];
}
