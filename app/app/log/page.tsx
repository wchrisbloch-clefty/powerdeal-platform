import FactLog from '@/components/modules/fact-log';
import PageHeader from '@/components/chrome/page-header';
import ReadFailureBanner from '@/components/ui/read-failure';
import { getDeals } from '@/lib/data';

export const metadata = { title: 'Log' };
export const dynamic = 'force-dynamic';

/**
 * LOG — the path from learning a fact to recording it.
 *
 * The platform reads an incomplete deal well. Until this existed there was no
 * way to make a deal less incomplete from anywhere except SQL: the application
 * could write exactly two fields on an existing deal, and neither was a fact.
 *
 * ⚠️ IN NAV, NOT BEHIND A TAB, and that is the requirement rather than a
 * preference. This gets used one-handed in a car park thirty seconds after a
 * call, or it does not get used — and a fact that needs the right form on the
 * right tab at a desk is gated harder than one behind a disabled button,
 * because the gate is invisible.
 *
 * ⚠️ THE SIGNAL IS WRITTEN BEFORE ANYTHING IS PROPOSED. Facts arrive out of
 * order, across the whole life of a deal, and a form organised by MEDDPICC
 * assumes a sequence the world does not follow. So there is no form: there is a
 * sentence, and the mapping is offered afterwards for a human to confirm.
 */
export default async function LogPage() {
  const { data: deals, readError } = await getDeals();

  return (
    <div className="mx-auto max-w-2xl space-y-rhythm-page">
      <PageHeader
        eyebrow="Capture"
        title="Log"
        lead={
          <p className="text-sm text-text-dim">
            Say what you learned. It is logged the moment you send it — timestamped
            and attached to the account — and then mapped to fields you confirm one
            at a time. Nothing is written to a deal without you.
          </p>
        }
      />

      {/* A failed read is not an empty pipeline. The picker below would say
          "no accounts" either way, and those are different facts. */}
      <ReadFailureBanner readError={readError} />

      <FactLog deals={deals} />
    </div>
  );
}
