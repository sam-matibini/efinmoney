# In-house AML & PEP Screening

Build our own screening engine inside eFinMoney instead of relying on Persona Reports or a paid third-party. We ingest official sanctions/PEP lists into our DB nightly, then fuzzy-match every KYC submission and every outbound transfer against them. Hits notify admins (no auto-freeze) and are reviewed in the CRM.

## Data sources (all free / open)

- **OFAC SDN + Consolidated** (US Treasury) — daily CSV/JSON
- **UN Consolidated Sanctions** — daily XML
- **EU Consolidated Financial Sanctions** — daily XML (with token, free)
- **UK HMT OFSI Consolidated List** — daily CSV
- **Canadian Consolidated (OSFI/SEMA/JVCFOA)** — daily XML, required for CRA/FINTRAC compliance
- **OpenSanctions PEPs dataset** — daily JSON dump (CC-BY, free for non-commercial; we'll attribute)

All are public-domain or permissively licensed. No vendor contract, no per-screen cost.

## Architecture

```text
                    ┌──────────────────────────────┐
                    │ aml-ingest-lists  (cron 02:00 │ ◄── pg_cron daily
                    │  UTC) downloads + parses 6    │
                    │  lists into aml_watchlist     │
                    └──────────────┬───────────────┘
                                   │
KYC submit ─────────► aml-screen ──┤
Transfer initiated ──► aml-screen ─┤   fuzzy match
P2P send ───────────► aml-screen ──┤   (pg_trgm + soundex
                                   │    + DOB/country)
                                   ▼
                          aml_screenings + aml_matches
                                   │
                                   ▼
                       admin notification (email + in-app)
                       CRM case created — NO freeze
```

## DB schema (migration)

- `aml_watchlist` — id, source (`ofac|un|eu|uk|ca|pep`), source_id, entity_type (`individual|entity|vessel`), name, name_normalized, aliases text[], dob_year int, dob date, nationalities text[], countries text[], programs text[], remarks, source_url, raw jsonb, ingested_at, list_published_at. Indexed with GIN on name_normalized (pg_trgm).
- `aml_screenings` — id, user_id, trigger (`kyc|transfer|p2p|manual|rescreen`), trigger_ref uuid, subject_name, dob, country, status (`clear|hit|error`), match_count, screened_at, screened_by.
- `aml_matches` — id, screening_id, watchlist_id, score numeric, match_type (`name|alias|dob_name|fuzzy`), disposition (`pending|true_match|false_positive|escalated`), reviewed_by, reviewed_at, notes, created_at.
- Add `aml_status` (`unscreened|clear|hit|review`) + `aml_last_screened_at` to `profiles`.
- RLS: users read only their own screenings/matches; admins (`is_admin_user` / `is_kyc_reviewer`) read+write all; service_role full. GRANTs included.
- Index: `aml_watchlist USING gin (name_normalized gin_trgm_ops)` for fast fuzzy lookup. Enable `pg_trgm` extension.

## Edge functions

1. **`aml-ingest-lists`** — runs daily via pg_cron + pg_net. Downloads each source, parses (XML/CSV/JSON), upserts into `aml_watchlist` keyed by `(source, source_id)`. Logs counts + errors to `system_logs`.
2. **`aml-screen`** — POST `{ user_id, trigger, trigger_ref?, subject_override? }`. Normalizes subject name, queries `aml_watchlist` using `similarity()` (threshold 0.75) + alias match + DOB-year tiebreak. Writes `aml_screenings` + `aml_matches`. If matches found:
   - sets `profiles.aml_status = 'hit'`
   - inserts admin notification via Communication Hub (`type='aml_alert'`)
   - emails compliance inbox via `invoke_send_email('aml_hit', ...)`
   - **does NOT freeze the wallet** (per policy)
3. **`aml-review`** — admin endpoint to set match disposition (`true_match|false_positive|escalated`) with audit log entry.

## Triggers / wiring

- **KYC**: call `aml-screen` from `persona-webhook` on `inquiry.approved`, and from `approve-kyc` admin endpoint. (Replaces missing Persona Report.)
- **Transfers**: add trigger on `transfers` INSERT → `pg_notify` → call `aml-screen` with `trigger='transfer'` (per "on transaction trigger only" policy). Same for `p2p_transfers`.
- **No scheduled rescreening** (per chosen policy). Watchlist itself still refreshes daily so the next transaction-time screen is current.

## Admin UI

- `/admin/aml` — new tab in Operations Control Center: list pending screenings + matches, filter by source/score, open detail drawer with side-by-side subject vs watchlist record, action buttons (True Match / False Positive / Escalate). Uses existing Admin shadcn table patterns.
- On `/admin/kyc/:id` review page: add **AML & PEP** panel showing latest screening result and matches with same actions.
- Notification badge in admin topbar when there are pending matches.

## Compliance memory updates

- New memory `mem://features/aml-pep-inhouse` describing sources, refresh cadence, match thresholds, no-freeze policy, review workflow.
- Update existing `mem://features/compliance-aml` to reference the in-house engine and remove dependency on Persona Reports.

## Secrets

None required. EU list optionally uses a free token — if we use it, we add `EU_SANCTIONS_TOKEN` via the secrets tool before deploying `aml-ingest-lists`.

## What I will NOT change

- Persona stays in place for ID verification only.
- Existing `compliance_rules` / `compliance_alerts` (velocity, structuring, amount) keep working — this is additive.
- Ledger, balances, KYC tiering, transfer flow untouched.

## Caveats / disclosure

Owning the screening list means we also own the compliance liability: parser breakage, missed updates, false negatives are on us. The cron job logs failures and emails the compliance inbox if a list fails to refresh for 48h. We can swap in OpenSanctions or ComplyAdvantage later by replacing only `aml-ingest-lists` + `aml-screen` internals; the rest of the system stays the same.
