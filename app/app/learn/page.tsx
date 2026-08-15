import LearnPanel from '@/components/modules/learn-panel';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="space-y-5">
      <div>
        <h1 className="text-lg text-text">Learn</h1>
        <p className="mt-0.5 text-xs text-text-dim">
          Explain it, drill it, roleplay it, compare it, or pick up where you left
          off. One box — it reads the question.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Practice</CardTitle>
            <p className="mt-0.5 text-xs text-text-dim">
              No scores, no levels, no mastery ratings — deliberately. The point is
              to work on the argument you are worst at, and a number on the screen
              is enough to stop that.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <LearnPanel />
        </CardBody>
      </Card>
    </div>
  );
}
