import Link from 'next/link';
import Button from '@/components/ui/button';

export const metadata = { title: 'Capture' };

/**
 * Manual capture surface.
 *
 * /app/capture is the Web Share Target and is POST-only — a route handler and
 * a page cannot share a path — so the share sheet lands there while this gives
 * the same thing a form. Both funnel into one handler, so an item pasted at a
 * desk is graded and account-mapped exactly like one shared from a phone.
 *
 * A plain <form> rather than fetch(): this must work on the first paint with
 * no JS, which is the whole point of a capture surface you reach in a hurry.
 */
export default function CapturePage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <p className="eyebrow">Intelligence</p>
        <h1 className="mt-1 font-display text-2xl text-text">Capture</h1>
        <p className="mt-2 text-sm text-text-dim">
          Paste anything worth keeping — a headline, a link, a note from a call.
          It is graded, summarised and mapped to your accounts on the way in.
          Shared items from your phone land here too.
        </p>
      </div>

      <form
        action="/app/capture"
        method="POST"
        className="space-y-3 rounded-card border border-rule bg-bg-raised p-4"
      >
        <label className="block">
          <span className="eyebrow mb-1.5 block">Headline</span>
          <input
            name="title"
            required
            placeholder="Valero announces Port Arthur expansion"
            className="h-10 w-full rounded-md border border-rule bg-bg px-3 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1.5 block">Link</span>
          <input
            name="url"
            type="url"
            placeholder="https://…"
            className="h-10 w-full rounded-md border border-rule bg-bg px-3 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-1.5 block">
            Notes <span className="normal-case">optional</span>
          </span>
          <textarea
            name="text"
            rows={4}
            placeholder="What matters about it, in your words."
            className="w-full rounded-md border border-rule bg-bg px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent-border focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-2 pt-1">
          {/* ⚠️ WAS HAND-ROLLED, AND THAT IS WHY IT STAYED BROKEN.
              This carried `bg-accent … text-white` at 2.5:1 and survived every
              contrast fix in the build, because none of them touched it — it
              was not a <Button>. --color-accent-fg was introduced for exactly
              this ratio and the shared primitive adopted it; this element sat
              outside the blast radius of both. */}
          <Button type="submit" variant="primary" size="md">
            Capture
          </Button>
          <Link
            href="/app/intelligence"
            className="text-sm text-text-dim underline underline-offset-2 hover:text-text"
          >
            Back to feed
          </Link>
        </div>

        <p className="text-xs text-text-faint">
          A human sharing something means it is interesting, not verified — captures
          are graded INFERRED until a source earns better.
        </p>
      </form>
    </div>
  );
}
