# Rotating the cron secrets

Two secrets, two trust boundaries, deliberately different values.

## Why two

They used to be one value in three places. On 2026-08-12 two of the three
drifted, every `net.http_post` got a 401, `pg_cron` recorded success because the
statement it runs is the *enqueue* rather than the request, and twelve missed
runs across two jobs reported healthy for five days.

The copies were not equally justified:

| Where | Gates | Status |
|---|---|---|
| `vault.secrets` (`cron_secret`) | `pg_cron` → Supabase edge functions | single source for the caller |
| Supabase edge secrets (`CRON_SECRET`) | the edge functions' own `isAuthorized` | irreducible — see below |
| Vercel env (`CRON_SECRET`) | `middleware.ts` → the Next cron routes | **a separate boundary** |

The pg_cron copy is gone: `schedule.sql` reads the vault at fire time.

The edge-function copy cannot go. An auth gate has to authenticate the caller
**before** trusting it; making it query the database first inverts that, turns a
database blip into a 500 where a 401 belongs, and needs a `security definer` RPC
to reach `vault` through PostgREST — which hands the secret to anything holding
the service key.

**The Vercel copy should never have been the same value.** It gates a different
runtime reaching different routes. Sharing one value means a leak of either
compromises both, for no benefit — nothing ever needed them equal.

So: `SUPABASE_CRON_SECRET` (vault ↔ edge) and `VERCEL_CRON_SECRET` (Vercel
middleware), rotated independently.

## Rotating the Supabase pair

Order matters. The edge function is the *verifier*; `pg_cron` is the *caller*.
Update the verifier first and calls fail closed for one window; update the caller
first and every call 401s until the verifier catches up — which is precisely the
August failure, run deliberately.

```bash
NEW=$(openssl rand -hex 32)

# 1. The verifier. Deploying secrets restarts the functions.
supabase secrets set CRON_SECRET="$NEW" --project-ref <ref>

# 2. Prove the verifier took it, before touching the caller.
#    Fires ccus-sweep and market-watch; rejects stall-alert without running it.
CRON_SECRET="$NEW" node scripts/cron-secret-check.mjs
```

Only when that passes:

```sql
-- 3. The caller. One statement; no schedule is rewritten.
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  '<the same NEW value>'
);

-- 4. Confirm it landed.
select name, updated_at from vault.secrets where name = 'cron_secret';
```

Then wait for one scheduled run and check it answered:

```sql
select id, status_code, left(content, 200), created
from net._http_response order by created desc limit 5;
```

⚠️ `net._http_response` is pruned after a few hours. An empty result is *no
recent calls*, not *no calls*.

### First-time setup

```sql
select vault.create_secret(
  '<value>', 'cron_secret',
  'Shared secret for pg_cron -> edge function calls'
);
```

⚠️ A missing vault row makes the header `NULL`, `jsonb_build_object` drops the
key entirely, and every call 401s — the August symptom, from a different cause.
`schedule.sql` carries the query to confirm the row exists first.

## Rotating the Vercel secret

Independent. Nothing in Supabase reads it.

```bash
openssl rand -hex 32          # a DIFFERENT value
```

Set `CRON_SECRET` in the Vercel project's environment, redeploy, and confirm the
Next cron routes answer:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST https://<deployment>/api/cron/recap \
  -H "x-cron-secret: $VERCEL_CRON_SECRET"
```

401 means the deployment has not picked up the new value yet.

## Confirming which code is live

Every function response carries `contract`. Compare it with `EDGE_CONTRACT` in
`supabase/functions/_shared/contract.ts`:

```bash
curl -sS -X POST https://<ref>.functions.supabase.co/ccus-sweep \
  -H "x-cron-secret: $SUPABASE_CRON_SECRET" \
  -H 'Content-Type: application/json' -d '{}' | head -c 200
```

A lower number than the repo means the deployment is behind. This exists because
a `window_hours: 336` request and a `window_hours: 48` request came back
byte-identical, and the only thing separating "the parameter worked" from "the
parameter was never deployed" was a field *missing* from the response — a signal
that works once, for a reader who already knows the source.

Deploy with:

```bash
supabase functions deploy ccus-sweep market-watch stall-alert \
  --project-ref <ref> --no-verify-jwt
```

⚠️ `--no-verify-jwt` is required. `pg_cron` sends only `x-cron-secret` and has no
Supabase JWT; with verification on, the platform gateway 401s every call *before*
the function's own auth check runs. `supabase/config.toml` sets this
declaratively — the flag is belt and braces for a manual deploy.
