# C3 Studio — Tenant ID Schema Verification (2026-04-14)

## Context
- Requested by Luis (Telegram, 2026-04-14 21:20 UTC) after confirming the production project ref: `uxczbwtfcsjsrmrikwoh`.
- Goal: ensure the frontend no longer filters/inserts `tenant_id` in tables that do not expose that column, and document the live check before continuing with new fixes.
- Method: direct REST calls against Supabase (`curl https://uxczbwtfcsjsrmrikwoh.supabase.co/rest/v1/...`) using the service key exported in `/root/.openclaw/c3_studio.env`.

## Tables without `tenant_id` (validated today)
| Table | Validation command | Result |
| --- | --- | --- |
| `diagnostics` | `curl .../diagnostics?select=id,tenant_id` | `42703 column diagnostics.tenant_id does not exist`
| `previews` | `curl .../previews?select=id,tenant_id` | `42703 column previews.tenant_id does not exist`
| `gbp_profiles` | `curl .../gbp_profiles?select=id,tenant_id` | `42703 column gbp_profiles.tenant_id does not exist`
| `gbp_posts` | `curl .../gbp_posts?select=id,tenant_id` | `42703 column gbp_posts.tenant_id does not exist`
| `client_photos` | `curl .../client_photos?select=id,tenant_id` | `42703 column client_photos.tenant_id does not exist`
| `credentials` | `curl .../credentials?select=id,tenant_id` | `42703 column credentials.tenant_id does not exist`
| `nap_checks` | `curl .../nap_checks?select=id,tenant_id` | `42703 column nap_checks.tenant_id does not exist`
| `briefs` | `curl .../briefs?select=id,tenant_id` | `42703 column briefs.tenant_id does not exist`
| `buyer_personas` | `curl .../buyer_personas?select=id,tenant_id` | `42703 column buyer_personas.tenant_id does not exist`
| `offers` | `curl .../offers?select=id,tenant_id` | `42703 column offers.tenant_id does not exist`
| `generated_outputs` | `curl .../generated_outputs?select=id,tenant_id` | `42703 column generated_outputs.tenant_id does not exist`
| `brightlocal_sync` | `curl .../brightlocal_sync?select=id,tenant_id` | `42703 column brightlocal_sync.tenant_id does not exist`

## Tables with `tenant_id`
Confirmed separately that only the following tables expose `tenant_id`, matching the operating rules:
- `clients`
- `users`
- `activity_log`
- `prompt_versions`

## Codebase audit (commit `64dd852`)
I grepped the repo (`grep -R "tenant_id" --exclude-dir .next`) and verified manually:
- All `.eq('tenant_id', …)` usages are scoped to `clients`, `users`, `activity_log`, or `prompt_versions`.
- Inserts that set `tenant_id` only occur when creating `clients`, logging `activity_log`, or persisting `prompt_versions`.
- Modules flagged by the original audit (`/clients/[id]`, onboarding pages, GBP, Photos, Preview generator, dashboard) now filter child tables purely by `client_id`.

## Conclusion
- Live schema and current `main` code are aligned with the rule “only the four core tables carry `tenant_id`”.
- No additional code changes were required for this item; the verification note documents the evidence so future audits can reference it before scheduling more fixes.
