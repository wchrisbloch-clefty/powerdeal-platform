import Link from 'next/link';
import { Check } from 'lucide-react';
import { Wordmark } from '@/components/ui/bloom-logo';
import ThemeToggle from '@/components/chrome/theme-toggle';
import Button from '@/components/ui/button';

export const metadata = { title: 'Pricing' };

const TIERS = [
  {
    name: 'Solo',
    price: 'Free',
    cadence: 'while you bring your own keys',
    description: 'The full platform, running on your own API keys.',
    features: [
      'Unlimited deals in the Pipeline Spine',
      'Market intelligence feed with graded provenance',
      'Infrastructure maps and pricing intelligence',
      'Document Forge — briefs, plans, MAPs, pro formas',
      'In-app chat with the PowerDeal methodology',
      'Bring your own Anthropic, Groq, and EIA keys',
    ],
    cta: 'Open PowerDeal',
    href: '/app',
    highlight: false,
  },
  {
    name: 'Team',
    price: 'Contact',
    cadence: 'per seat, per month',
    description: 'Managed keys, shared pipeline, scheduled intelligence.',
    features: [
      'Everything in Solo',
      'Managed AI keys — no per-user setup',
      'Shared pipeline across the team',
      'Scheduled sweeps: Friday market watch, daily stall alerts',
      'CCUS tracker with automated Class VI monitoring',
      'Priority support',
    ],
    cta: 'Get in touch',
    href: 'mailto:hello@powerdeal.app?subject=PowerDeal%20Team',
    highlight: true,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-rule">
        <div className="shell flex h-[var(--topbar-height)] items-center justify-between">
          <Link href="/"><Wordmark /></Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/app">
              <Button variant="secondary" size="sm">Open PowerDeal</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="shell py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 h-0.5 w-12 rounded-full bg-accent" />
          <h1 className="font-display text-4xl leading-tight text-text md:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-text-dim">
            The platform runs on open data and your own API keys. You only pay us when
            you want us to run the keys and the schedules for you.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl gap-5 md:grid-cols-2">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-card border bg-bg-raised p-6 ${
                tier.highlight ? 'border-accent-border' : 'border-rule'
              }`}
            >
              <h2 className="font-display text-xl text-text">{tier.name}</h2>
              <p className="mt-3 font-display text-3xl text-text">{tier.price}</p>
              <p className="mt-0.5 text-xs text-text-faint">{tier.cadence}</p>
              <p className="mt-3 text-sm text-text-dim">{tier.description}</p>

              <ul className="mt-5 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-text-dim">
                    <Check
                      size={15}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-accent"
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href={tier.href} className="mt-6 block">
                <Button
                  variant={tier.highlight ? 'primary' : 'secondary'}
                  size="lg"
                  className="w-full"
                >
                  {tier.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-text-dim">
          Every data source the platform reads — EIA, EPA, FERC, and the trade press
          feeds — is free and open. There is no data licensing markup baked into either
          tier.
        </p>
      </main>

      <footer className="border-t border-rule py-10">
        <div className="shell">
          <p className="text-sm text-text-dim">
            PowerDeal — Built for the people who close complex energy deals.
          </p>
        </div>
      </footer>
    </div>
  );
}
