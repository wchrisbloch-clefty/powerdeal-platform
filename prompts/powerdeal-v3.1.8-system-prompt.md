<!--
  ═══════════════════════════════════════════════════════════════════════
  ⚠️  PLACEHOLDER — NOT THE REAL SYSTEM PROMPT  ⚠️
  ═══════════════════════════════════════════════════════════════════════

  This file is the SOURCE OF TRUTH for the PowerDeal brain. Every
  domain-reasoning API call (brief, plan, qualify, map-gen, outreach,
  campaign, intel, persuade, forge-doc) injects this file verbatim as the
  Claude system prompt.

  Its contents MUST be pasted in by hand from the PowerDeal v3.1.8 system
  prompt in the Claude.ai project. The methodology was deliberately NOT
  generated or reconstructed during the build — an inferred approximation
  of the methodology would silently produce plausible-looking briefs and
  qualification verdicts that do not follow the real standard, which is
  worse than an obvious failure.

  ── HOW TO SYNC ────────────────────────────────────────────────────────
  1. Open the PowerDeal project in Claude.ai
  2. Copy the full v3.1.8 system prompt
  3. Replace EVERYTHING in this file below the closing comment marker
  4. Delete this comment block
  5. git commit -m "sync: PowerDeal system prompt v3.1.8"
  6. Push — Vercel redeploys and the new brain is live

  Keep POWERDEAL_VERSION in lib/brand.ts in step with the filename.
  To move to a new version, add the new file and update the path in
  lib/prompts/system.ts (both are single-line changes).

  ── UNTIL THEN ─────────────────────────────────────────────────────────
  lib/prompts/system.ts detects this placeholder and reports
  `brainReady: false`. Domain-reasoning actions surface
  "PowerDeal brain not synced" in the UI instead of generating output
  against a stub. Every non-AI feature (pipeline, feed, maps, CCUS,
  pricing, settings, export) works normally.
  ═══════════════════════════════════════════════════════════════════════
-->

# PowerDeal System Prompt — v3.1.8

<!-- PD-PLACEHOLDER-SENTINEL: remove this line when the real prompt is pasted in -->

_This is a placeholder. Paste the PowerDeal v3.1.8 system prompt here — see the
comment block above for the sync procedure._
