import LearnPanel from '@/components/modules/learn-panel';
import ShapeVocabulary from '@/components/learn/shape-vocabulary';
import LearnPractice from '@/components/learn/practice';
import { resolvePaths } from '@/lib/learn/paths-resolve';
import { resolveScenarios } from '@/lib/learn/practice/scenarios-resolve';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/chrome/page-header';

export const metadata = { title: 'Learn' };
export const dynamic = 'force-dynamic';

/**
 * LEARN — the doctrine, practised.
 *
 * Universal and structurally DEAL-FREE. Nothing in `lib/learn/` imports a
 * Deal, a pipeline type, or `lib/data`, and there is no deal picker on this
 * page. Learning the four-lever diagnostic is not an operation on an account,
 * and a learn surface that needed a deal selected first would be unusable in
 * the ninety seconds between meetings that is the only time anyone opens it.
 *
 * Nothing gates. No prior session is required, no configuration is required,
 * and a failed session write never withholds an answer.
 */
export default function LearnPage() {
  return (
    <div className="space-y-rhythm-page">
      <PageHeader
        eyebrow="Practice"
        title="Learn"
        lead={
          /* The reading scale, on the surface the brief calls out as needing to
             be the most spacious in the platform. Everywhere else this line is
             `text-sm`; here it is prose and is set as prose. */
          <p className="prose-lead text-text-dim">
            Explain it, drill it, roleplay it, compare it, or pick up where you left
            off. One box — it reads the question.
          </p>
        }
      />

      <Card>
        <CardHeader>
          <div>
            {/* ⚠️ NOT "Practice". This card was called that when it was the only
                card on the page, and the rehearsal card below inherited the same
                title — two headings reading "Practice" on one surface, each
                leading somewhere different. The render check asserts ONE <h1> per
                surface and these are card titles, so nothing caught it. */}
            <CardTitle>Ask</CardTitle>
            <p className="mt-0.5 max-w-measure text-xs text-text-dim">
              One box — it reads the question. No scores, no levels, no mastery
              ratings, deliberately: the point is to work on the argument you are
              worst at, and a number on the screen is enough to stop that.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          {/* Resolved on the server: `loadKnowledge` reads the disk, and a path
              whose doctrine is missing must render as a gap rather than as
              questions with nothing behind them. */}
          <LearnPanel paths={resolvePaths()} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Practice</CardTitle>
            <p className="mt-0.5 max-w-measure text-xs text-text-dim">
              Rehearsal, not quizzing. The buyer responds to what you actually said —
              and responds as that person, not as a difficulty setting. Nothing here
              rates you, and nothing is kept but the transcript.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <LearnPractice scenarios={resolveScenarios()} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What it can draw</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              The whole visual vocabulary, and the panel you get when a question
              needs a shape this does not have.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <ShapeVocabulary />
        </CardBody>
      </Card>
    </div>
  );
}
