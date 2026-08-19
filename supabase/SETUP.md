# PowerDeal — Setup in 4 Steps

Do these in order. Each is a copy-paste.

> **These files replace the earlier `step2/step3/step4` drafts.** Two blocking
> bugs were fixed — see [What changed](#what-changed-from-the-drafts) at the
> bottom. Run these, not the originals.

---

## Step 1 — Put the brain in the repo (GitHub)

1. Download `powerdeal-v3.1.8-system-prompt.md` from your Claude outputs
2. Open the repo → `prompts/powerdeal-v3.1.8-system-prompt.md`
3. Pencil icon → select all → delete → paste your file's contents
4. **Commit changes**
5. Wait ~30s → Vercel redeploys → brain is live

**Verify:** Settings → Status should show `v3.1.8 synced` instead of
`Not synced`.

---

## Step 2 — Create the database (Supabase)

SQL Editor → New query → paste **`supabase/schema.sql`** → Run.

Safe to re-run. Creates every table, RLS policy, and the two triggers that
keep the pipeline honest:

- **`deals_health_score`** recomputes health on every insert and update, so a
  score can never go stale or be hand-edited out of line with the rest of the
  book.
- **`deals_stage_transition`** logs a row to `stage_transitions` and resets
  `days_in_stage` whenever a stage changes — through the app, raw SQL, or an
  edge function.

---

## Step 3 — Load the 21 pipeline accounts (Supabase)

SQL Editor → New query → paste **`supabase/seed.sql`** → Run.

Works **before or after** your first sign-in:

- Run it **before** → loads the template; `seed_new_user()` copies it to you
  automatically on first login.
- Run it **after** → loads the template *and* assigns it to you immediately.

Re-running never overwrites a deal you have edited (`ON CONFLICT DO NOTHING`
on `(user_id, deal_id)`).

**Verify:** the bottom of the output lists 21 rows, and Pipeline shows them.

---

## Creating your login

Sign-in is **email + password** (`signInWithPassword`). There is no magic
link, so the account has to exist *with a password set* before you can get in.

Supabase → **Authentication → Users → Add user**

- Enter your email and a password
- Tick **Auto Confirm User**, otherwise Supabase holds the account pending an
  email confirmation and the password will not work

If you already signed in with a magic link at any point, that account exists
but has **no password**, and signing in will fail with *"Invalid login
credentials"* — the same error as a wrong password, because Supabase
deliberately does not reveal which accounts exist. Fix it in the same place:
**Authentication → Users →** your row **→ Reset password**, or send yourself a
recovery email, which still works via `/auth/callback`.

---

## Step 4 — Load intelligence + market watch history (Supabase)

**Sign in to the app at least once first** — see [Creating your login](#creating-your-login)
below if you have not set a password yet.

SQL Editor → New query → paste **`supabase/seed-intelligence.sql`** → Run.

Loads 3 intelligence signals and 3 rate-move market watch entries.

**Verify:** the final query prints each headline with the accounts it maps to.
None of the `hits` column should be empty:

```
Dominion Energy Virginia rate increase approved …   9  verified  Ironvale Defense Systems, Calderwood Marine Group, Helix Avionics Group
SDG&E authorized 3% annual base revenue increases … 9  verified  Ironvale Defense Systems, Verano Estate Winery
Dominion Energy South Carolina ~12.7% …             8  reported  Ironvale Defense Systems
```

---

## After all four

| Check | Expected |
|---|---|
| **Pipeline** | 21 deals, Ironvale Defense Systems at the top (lowest health) |
| **Deal → Ironvale Defense Systems** | the named contact Reitsma as champion, 116 MW, SDG&E |
| **Deal → Ironvale → Market watch tab** | The Dominion VA and SDG&E entries |
| **Deal → Tamarack Transmission → Signals tab** | Both midstream market-trend signals |
| **Intelligence** | Rate-move entries once you run a sweep |
| **Chat** | "brief me on Ironvale" → a real brief, not `BRAIN_NOT_SYNCED` |

Still seeing `BRAIN_NOT_SYNCED`? Step 1 didn't take. Confirm the committed file
no longer contains the line `PD-PLACEHOLDER-SENTINEL`.

---

## What changed from the drafts

**`step4-intelligence-seed.sql` could not have run.** `user_id` was in every
column list but missing from every `VALUES` tuple — 9 columns against 8 values
on `intelligence_log`, 11 against 10 on `market_watch_log`. Postgres would have
rejected all six inserts with *"INSERT has more target columns than
expressions"*. Fixed in `seed-intelligence.sql`.

**Three signals pointed at the wrong accounts.** The Ardent Polymers/Quillon spinoff
signal was mapped to Ironvale Defense Systems; its own text is about IND-014 and IND-004.
The two midstream signals had `deal_ids` set to `NULL` while naming six
accounts in the body — so they would have appeared on no deal page at all.
All three now map to the accounts they actually name.

**`step2-schema.sql` was missing columns the app queries.** `metrics_known`,
`decision_criteria`, and `partner_notes` back the MEDDPICC scorecard, and
`feed_items.url_hash` is the conflict target for the sweep's upsert — without
it, every sweep would have failed and the summary cache would never hit. Also
added: the `prompts` table, `pg_cron`/`pg_net`, both triggers, and `WITH CHECK`
on the RLS policies so a user cannot *write* a row owned by someone else rather
than merely failing to read one.

**Health scores are computed, not hand-set.** The drafts assigned values like
`4` and `3` directly. The trigger now derives them, so Ironvale opens at **2.8**
rather than 4 — MEDDPICC 1/8, no economic buyer, single-threaded. That is the
formula reporting what the record actually contains, and it climbs as you fill
the gaps in. A book where some scores are hand-set and others computed can't be
ranked against itself, which is the whole point of having a score.
