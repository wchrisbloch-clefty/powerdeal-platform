/**
 * Environment validation.
 *
 * GLOBAL RULE 4: zero API keys = graceful degradation. Nothing here throws —
 * a missing key is a WARNING that names what stops working, never a crash.
 * The product must boot and be useful with an empty .env.local.
 */

export interface EnvStatus {
  supabase: boolean;
  anthropic: boolean;
  groq: boolean;
  gemini: boolean;
  eia: boolean;
  poweroutage: boolean;
  youtube: boolean;
  stripe: boolean;
}

export function envStatus(): EnvStatus {
  return {
    /**
     * Persistence now depends on the SERVICE ROLE key, not the anon key.
     * Sign-in was removed, so there is no session for RLS to key off — all
     * data access runs service-role and scoped in code. Reporting the anon
     * key here would show green while every query returned nothing.
     */
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    gemini: Boolean(process.env.GOOGLE_AI_KEY),
    eia: Boolean(process.env.EIA_API_KEY),
    poweroutage: Boolean(process.env.POWEROUTAGE_API_KEY),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}

/** Human-readable degradation notes — each says what stops working. */
export function collectEnvWarnings(): string[] {
  const env = envStatus();
  const warnings: string[] = [];

  if (!env.supabase) {
    warnings.push(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — running on seed data, nothing persists.',
    );
  }
  if (!env.anthropic) {
    warnings.push(
      'ANTHROPIC_API_KEY missing — domain AI (brief, plan, qualify, MAP, outreach, chat) unavailable.',
    );
  }
  if (!env.groq) {
    warnings.push('GROQ_API_KEY missing — feed summaries fall through to Gemini or Claude.');
  }
  if (!env.gemini) {
    warnings.push('GOOGLE_AI_KEY missing — Gemini tier skipped in the routing chain.');
  }
  if (!env.eia) {
    warnings.push('EIA_API_KEY missing — rate data and the pricing map show "—".');
  }
  if (!env.poweroutage) {
    warnings.push('POWEROUTAGE_API_KEY missing — live outage layer hidden from the map.');
  }
  if (!env.youtube) {
    warnings.push('YOUTUBE_API_KEY missing — YouTube transcripts skipped in Social.');
  }

  return warnings;
}

/** Any AI provider at all — gates the "AI key required" empty states. */
export function hasAnyAiKey(): boolean {
  const env = envStatus();
  return env.anthropic || env.groq || env.gemini;
}
