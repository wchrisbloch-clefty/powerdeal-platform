import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Wordmark } from '@/components/ui/bloom-logo';
import ProvenanceChip, { ConfidenceRule } from '@/components/ui/provenance-chip';
import ThemeToggle from '@/components/chrome/theme-toggle';
import Button from '@/components/ui/button';

export const metadata = {
  title: 'PowerDeal — The AI BD platform for behind-the-meter power sales',
};

const PILLARS = [
  {
    n: '01',
    title: 'Know the market',
    body: 'Graded intelligence across utility rates, grid stress, O&G and industrial news, and CCUS updates — mapped to your specific accounts. Every item tells you who to call.',
  },
  {
    n: '02',
    title: 'Advance the deal',
    body: 'AI-generated briefs, account plans, and MAPs built from the PowerDeal methodology. The same brain that runs in Claude.ai, deployed inside your platform.',
  },
  {
    n: '03',
    title: 'Win or lose fast',
    body: 'Decision-process mapping, MEDDPICC scoring, stage conversion tracking, win-loss discipline. The system that tells you when a deal is real and when to cut it.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-rule">
        <div className="shell flex h-[var(--topbar-height)] items-center justify-between">
          <Wordmark />
          <nav className="flex items-center gap-2">
            <Link href="/pricing" className="px-2 text-sm text-text-dim hover:text-text">
              Pricing
            </Link>
            <ThemeToggle />
            <Link href="/app">
              <Button variant="primary" size="sm">
                Open PowerDeal
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="shell py-20 md:py-28">
          <div className="max-w-3xl">
            {/* The single accent element on this viewport. */}
            <div className="mb-7 h-0.5 w-14 rounded-full bg-accent" />
            <p className="eyebrow mb-3">PowerDeal</p>
            <h1 className="font-display text-4xl leading-[1.08] text-text md:text-6xl">
              The AI BD platform built for behind-the-meter power sales.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-text-dim">
              Know the market. Advance the deal. Win fast.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app">
                <Button variant="primary" size="lg">
                  Open PowerDeal <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="secondary" size="lg">
                  See pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <hr className="rule-line" />

        {/* ── Three pillars ── */}
        <section className="shell py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-3 md:gap-8">
            {PILLARS.map((p) => (
              <div key={p.n}>
                <p className="font-mono text-xs tracking-label text-text-faint">{p.n}</p>
                <h2 className="mt-2 font-display text-xl text-text">{p.title}</h2>
                <p className="mt-2.5 text-sm text-text-dim">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule-line" />

        {/* ── Demo item — the signature element ── */}
        <section className="shell py-16 md:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="eyebrow mb-3">What an item looks like</p>
            <h2 className="mb-6 font-display text-2xl text-text">
              Every signal is graded, mapped, and actionable.
            </h2>

            <article className="rounded-card border border-rule bg-bg-raised p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ProvenanceChip tier="verified" />
                <span className="text-xs text-text-dim">Utility regulator filing</span>
                <span className="text-xs text-text-faint">· Power Markets</span>
              </div>

              <h3 className="mt-2.5 font-display text-lg text-text">
                Rate increase authorized: 3%/yr compound through 2027
              </h3>

              <ConfidenceRule confidence={0.94} className="my-3" />

              <p className="text-sm text-text-dim">
                A commission authorized annual base revenue increases at one of the
                highest-cost utilities in the country, locking in a compounding rate
                trajectory through 2027. Industrial customers in the territory now have a
                dated, on-the-record cost curve rather than a forecast.
              </p>

              <p className="mt-3 text-sm italic text-accent-dim">
                → Hits 2 accounts in your pipeline. The cost-certainty conversation just
                got a deadline.
              </p>

              <p className="mt-3 border-t border-rule pt-2.5 text-xs text-text-faint">
                Illustrative example. Live items carry the real source, date, and the
                accounts they map to.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule py-10">
        <div className="shell flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-text-dim">
            PowerDeal — Built for the people who close complex energy deals.
          </p>
          <Wordmark className="opacity-60" />
        </div>
      </footer>
    </div>
  );
}
