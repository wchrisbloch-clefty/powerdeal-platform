import { winLossLog, withVerbatim } from '@/lib/win-loss';
import WinLossList from '@/components/modules/win-loss-list';
import PageHeader from '@/components/chrome/page-header';

export const dynamic = 'force-dynamic';

/**
 * /app/win-loss — the whole log, across accounts.
 *
 * The per-deal tab answers "what happened here". This answers the question the
 * verbatims actually exist for: what do buyers say when they do not buy, in
 * their own words, across every close. That is the version of this record that
 * compounds, and it only works if there is somewhere to read it.
 */
export default async function WinLossPage() {
  const entries = await winLossLog();
  const quoted = withVerbatim(entries);

  return (
    <div className="space-y-rhythm-page">
      <PageHeader
        eyebrow="Outcomes"
        title="Win-loss"
        lead={
          <p className="text-sm text-text-dim">
            What buyers actually said, in their words. A category tells you a deal was lost to
            budget; the sentence tells you what to do about the next one.
          </p>
        }
      />

      {entries.length > 0 ? (
        <p className="rounded-card border border-rule bg-bg-raised px-3.5 py-2.5 text-xs text-text-dim">
          <span className="text-text">
            {quoted.length} of {entries.length}
          </span>{' '}
          closes carry a verbatim. The rest hold only a category, which is a record rather than
          evidence.
        </p>
      ) : null}

      <WinLossList entries={entries} showCompany />
    </div>
  );
}
