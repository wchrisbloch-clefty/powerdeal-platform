# PowerDeal Platform

**AI-augmented BD and sales intelligence for behind-the-meter SOFC power sales.**

PowerDeal is the commercial operating system for selling on-site baseload power into
industrial, O&G, defense, and data center accounts. It replaces a markdown pipeline
spine with a live deal database, surfaces graded market intelligence mapped to the
specific accounts it affects, and runs the PowerDeal methodology — briefs, account
plans, MAPs, qualification, outreach — inside the product instead of in a chat window.

---

## Architecture: senses → brain → action

**Senses.** RSS ingestion across ~17 curated open sources, plus a separate discovery
net whose only job is finding stories the curated sources missed. Every item gets a
provenance grade (VERIFIED / REPORTED / INFERRED), a confidence score, and a mapping
to the pipeline accounts it actually touches. Free public data throughout — EIA,
EPA, FERC, trade press. No walled APIs.

**Brain.** The PowerDeal methodology lives in `prompts/` as a markdown file, read
verbatim at runtime and injected into every domain-reasoning call. It is never
generated, inferred, or paraphrased in code — updating the methodology is a file
edit and a commit, not a code change.

**Action.** Briefs, account plans, MAPs, outreach sequences, qualification verdicts,
and strategic reads — streamed live, exportable as DOCX/PPTX/XLSX/MD.

### The economics

The model router sends each task to the cheapest capable provider:

| Task | Chain | Why |
|---|---|---|
| `summarize`, `classify` | Groq → Gemini → Claude | High volume, low complexity |
| `market-watch` | Gemini → Groq → Claude | Signal triage, not reasoning |
| `recap`, `synthesize`, `ask` | Claude → Gemini → Groq | Structure matters |
| `brief`, `plan`, `qualify`, `map-gen`, `outreach`, `campaign`, `intel`, `persuade`, `forge-doc` | **Claude only** | No fallback — see below |

The nine domain tasks have **no fallback chain by design**. If `ANTHROPIC_API_KEY` is
absent they fail loudly rather than producing a brief that looks right and doesn't
follow the methodology. A silently degraded qualification verdict is worse than none.

Costs are held down by caching, not by cutting quality: summaries cache for 24 hours
keyed on canonical URL, so re-running a sweep costs approximately nothing, and the
system prompt is marked cacheable so repeat domain calls pay a fraction on input.

---

## Tech stack

Next.js 15 (App Router) · TypeScript strict · Tailwind over CSS custom properties ·
Supabase (Postgres + RLS + Auth + Edge Functions) · Leaflet · Anthropic SDK ·
docx / pptxgenjs / exceljs · PWA with Web Share Target

---

## Quick start

```bash
npm install
cp .env.example .env.local     # every variable is optional
npm run dev                    # http://localhost:3000
```

**It runs with an empty `.env.local`.** You get the template pipeline, the full UI,
maps, and the CCUS tracker. Adding keys turns on capabilities one at a time — see
`.env.example`, where each entry says exactly what you lose without it.

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → run `supabase/schema.sql`
3. SQL Editor → run `supabase/seed.sql` (loads the template pipeline)
4. Put the project URL and anon key in `.env.local`
5. Authentication → Providers → enable Email, and turn **off** "Confirm email"
   (magic links handle verification)
6. Authentication → URL Configuration → add `http://localhost:3000/auth/callback`
   and your production callback URL

On first login `seed_new_user()` copies the template accounts into the account and
creates the settings row. It is idempotent.

### Edge functions and schedules

```bash
supabase functions deploy market-watch stall-alert ccus-sweep
supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set APP_URL=https://your-deployment.vercel.app
```

Then edit `supabase/functions/schedule.sql` — replace `{PROJECT_REF}` and
`{CRON_SECRET}` — and run it in the SQL Editor.

> **The daily stall alert also ticks `days_in_stage`,** which feeds the health score.
> If that job stops running, health scores silently stop degrading and stalled deals
> keep looking healthy. Check it first if the pipeline looks suspiciously good.

### Vercel

Import the repo, add the same environment variables, deploy. Every route that needs
a request is already marked dynamic.

---

## ⚠️ Two things to do before this is production-real

### 1. Sync the PowerDeal brain

`prompts/powerdeal-v3.1.8-system-prompt.md` **ships as a placeholder.** The
methodology was deliberately not reconstructed during the build — an inferred
approximation would generate confident briefs and qualification verdicts that don't
follow the real standard, which is worse than an obvious failure.

Until it is synced, `BRAIN_READY` is false and every domain-reasoning surface says
"PowerDeal brain not synced" instead of generating. Everything else works.

```
1. Open the PowerDeal project in Claude.ai
2. Copy the full v3.1.8 system prompt
3. Replace the contents of prompts/powerdeal-v3.1.8-system-prompt.md
4. git commit && git push    → Vercel redeploys, the new brain is live
```

To move to a new version: add the new file, bump `POWERDEAL_VERSION` in
`lib/brand.ts`. `PROMPT_FILENAME` is derived from it, so that is the only change.

### 2. Load the real pipeline

`supabase/seed.sql` contains 21 **template** accounts — real company names in the
right verticals and states, so the UI has realistic data to render. MEDDPICC fields,
MW figures, beachhead sites, and contact names are deliberately **blank**, not
invented. A fabricated champion name or MW number that reads as real would flow
straight into a generated brief and out to a customer.

To load the real Spine: export `Pipeline-Spine.md` to CSV matching the `deals`
columns, then either replace the `VALUES` block in `seed.sql` or import through
Supabase Studio. Then `delete from deals where user_id is null;` to drop the
template.

---

## Repo structure

```
app/
  page.tsx                  Landing
  pricing/                  Pricing
  login/                    Magic-link sign-in
  auth/callback/            Session exchange + first-login seed
  app/                      The product (auth-gated)
    page.tsx                Dashboard — leads with problems, not totals
    pipeline/               Spine table + deal detail
    intelligence/           Graded feed + context ticker
    maps/                   Leaflet, 5 layer groups
    social/                 Following · Trending · Watchlist
    ccus/                   Class VI primacy + event feed
    pricing-intel/          Rate map + per-account benchmark
    forge/                  Document generation
    chat/                   In-app AI with the brain loaded
    settings/               Sources, watchlist, notifications
    capture/route.ts        Web Share Target landing
  api/
    ai/                     Unified streaming endpoint (all AI goes here)
    deals/                  CRUD + CSV export
    signals/                Intelligence Log
    feed/  feed/sweep/      Feed read + the ingestion sweep
    geo/                    Map layers, EIA rates, outages
    forge/                  DOCX / PPTX / XLSX rendering
    social/  settings/

lib/
  verticals/                ← the architectural heart, see below
  prompts/system.ts         Loads the brain, gates on BRAIN_READY
  prompts/modules/          9 task modules — framing only, never methodology
  engine/
    model-routing.ts        Provider chains, streaming, prompt caching
    rss.ts  tiering.ts      Fetch, grade, map to accounts
    summarize.ts            24h cache
    discover.ts             Coverage-gap detection
    sweep.ts                The full ingestion pipeline
  geo/                      Layers, EIA, EPA, outages, state centroids
  deals.ts                  Health scoring (mirrors the SQL trigger)
  data.ts                   Supabase reads with seed fallback

supabase/
  schema.sql                Tables, RLS, health + transition triggers
  seed.sql                  21 template accounts
  functions/                3 edge functions + pg_cron schedules

prompts/                    ← the brain (sync by hand)
styles/tokens.css           ← every color in the product
```

---

## Adding a vertical

The vertical config is the architectural heart. `lib/verticals/powerdeal.ts` declares
everything domain-specific — sources, categories, nav modules, ticker, assessment
questions, vocabulary, accent color. Components read the active vertical and render
whatever it declares.

A new vertical is **one file**:

```ts
// lib/verticals/your-vertical.ts
import type { VerticalConfig } from './types';

export const yourVertical: VerticalConfig = {
  id: 'your-vertical',
  name: 'Your Vertical',
  categories: [...],
  modules: [...],
  sources: [...],      // core feeds — enter the main feed
  discovery: [...],    // gap detection only — never the main feed
  ticker: {...},
  assessment: {...},
  theme: { accent: '#...' },
};
```

Register it in `lib/active-vertical.ts` and set `NEXT_PUBLIC_VERTICAL_ID`. Zero
component changes.

---

## Conventions worth knowing

**No hardcoded colors.** `styles/tokens.css` is the single source of color truth;
Tailwind maps names onto those variables. A literal hex in a component breaks the
theme swap. The three deliberate exceptions are documented where they occur: Leaflet
(paints to canvas outside the themed DOM), generated documents (DOCX/PPTX have no CSS),
and `lib/brand.ts` (the manifest theme color).

**Bloom green is a secondary accent.** One accent element per viewport — the primary
action, the active nav marker, or a verified provenance chip. Never a background wash
or a nav fill.

**Provenance is load-bearing.** VERIFIED means a primary source: government,
regulator, filing, transcript. REPORTED means credible trade press. INFERRED means
discovery net, social, or model inference. Discovery-net items can never be promoted
above INFERRED, which is the whole point of running two separate nets.

**Nothing is invented to fill a gap.** Unavailable data renders as "—" with a tooltip
naming the missing key. The pro forma ships formulas with every assumption cell blank.
Where a data source needs credentials we don't have, the endpoint returns empty with
an explanation rather than an approximation — see
`app/api/geo/co2-pipelines/route.ts`.

**RLS on every table.** Policies use explicit `USING` *and* `WITH CHECK`, so a user
can never write a row owned by someone else — not merely fail to read one. Edge
functions use the service role and bypass RLS entirely, which makes `user_id` scoping
the caller's responsibility on every query.

**All Claude calls stream.** Domain reasoning can run 30+ seconds; buffering it means
a timeout and a blank screen.

---

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build (runs strict typecheck)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

---

PowerDeal — Built for the people who close complex energy deals.
