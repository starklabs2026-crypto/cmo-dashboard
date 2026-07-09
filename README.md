# CMO Daily P&L Dashboard

Next.js App Router dashboard for daily app-wise P&L across RevenueCat revenue data and Windsor.ai Apple Search Ads spend. Dashboard reads come from Supabase Postgres; third-party APIs are only called from protected server routes.

## Included Apps

- Cado
- Dishit
- Medzy
- Crylens
- Fernly
- Rate My Skin

The target Supabase project URL is:

```txt
https://skcvmktjwqdgggeqscnq.supabase.co
```

Keep all API keys in environment variables. Do not commit `.env.local`.

## Setup

## Current Connection Status

Supabase schema and app seed data have been applied to `https://skcvmktjwqdgggeqscnq.supabase.co`.

RevenueCat and Windsor.ai are not live-connected until their API keys are added as server-side environment variables. The code is wired to call those services from protected API routes only:

- RevenueCat sync: `POST /api/sync/revenuecat`
- Windsor.ai sync: `POST /api/sync/windsor`
- Combined sync: `POST /api/sync/all`

The dashboard never calls RevenueCat or Windsor.ai from the browser. It reads Supabase through Next.js API routes.

1. Install dependencies

```bash
npm install
```

2. Create or select the Supabase project

Use the Supabase CMO project above. The public schema is expected to be empty before the first migration.

3. Run migrations

Apply `supabase/migrations/20260706000100_create_cmo_dashboard.sql` in Supabase SQL Editor or through your Supabase CLI workflow.

4. Add env vars

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Set:

- `REVENUECAT_API_KEY`: optional RevenueCat v2 secret key with charts/metrics permissions if one key or OAuth token can access all RevenueCat projects.
- `REVENUECAT_API_KEY_CADO`, `REVENUECAT_API_KEY_DISHIT`, `REVENUECAT_API_KEY_MEDZY`, `REVENUECAT_API_KEY_CRYLENS`, `REVENUECAT_API_KEY_FERNLY`, `REVENUECAT_API_KEY_RATE_MY_SKIN`: RevenueCat v2 secret keys when each app is in a separate RevenueCat project.
- `REVENUECAT_API_KEYS`: optional JSON object keyed by dashboard app name or RevenueCat project id, for example `{"Cado":"sk_...","Dishit":"sk_..."}`. Use this instead of the per-app env vars if you prefer one Vercel env value.
- `WINDSOR_API_KEY`: Windsor.ai API key.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key, server only.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable key.
- `SYNC_SECRET`: shared secret for protected sync API routes and the GitHub Actions scheduler.
- `USD_TO_INR`: default `95.22`.

5. Seed apps

```bash
npm run seed
```

The seed inserts the six apps plus RevenueCat/Windsor mappings. RevenueCat project names are seeded as placeholders. Replace `apps.revenuecat_project_id` with real RevenueCat `proj...` IDs if the API key cannot resolve project names through `/v2/projects`.

6. Run local dev

```bash
npm run dev
```

Open `http://localhost:3000`.

7. Manually run sync

```bash
curl -X POST "http://localhost:3000/api/sync/revenuecat" \
  -H "Authorization: Bearer $SYNC_SECRET"
curl -X POST "http://localhost:3000/api/sync/windsor" \
  -H "Authorization: Bearer $SYNC_SECRET"
curl -X POST "http://localhost:3000/api/sync/all" \
  -H "Authorization: Bearer $SYNC_SECRET"
```

Optional date range:

```bash
curl -X POST "http://localhost:3000/api/sync/all?date_from=2026-07-01&date_to=2026-07-06" \
  -H "Authorization: Bearer $SYNC_SECRET"
```

8. Deploy to Vercel

Set the app env vars in Vercel. Only `NEXT_PUBLIC_*` values are exposed to the browser. `SUPABASE_SERVICE_ROLE_KEY`, RevenueCat secret keys, `WINDSOR_API_KEY`, and `SYNC_SECRET` must stay server-only.

Required Vercel environment values:

```txt
SUPABASE_URL=https://skcvmktjwqdgggeqscnq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard, server only>
NEXT_PUBLIC_SUPABASE_URL=https://skcvmktjwqdgggeqscnq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase publishable key>
REVENUECAT_API_KEY=<optional all-project RevenueCat secret key or OAuth token>
REVENUECAT_API_KEY_CADO=<Cado RevenueCat secret API key>
REVENUECAT_API_KEY_DISHIT=<Dishit RevenueCat secret API key>
REVENUECAT_API_KEY_MEDZY=<Medzy RevenueCat secret API key>
REVENUECAT_API_KEY_CRYLENS=<Crylens RevenueCat secret API key>
REVENUECAT_API_KEY_FERNLY=<Fernly RevenueCat secret API key>
REVENUECAT_API_KEY_RATE_MY_SKIN=<Rate My Skin RevenueCat secret API key>
WINDSOR_API_KEY=<Windsor.ai API key>
WINDSOR_CONNECTOR=apple_search_ads
SYNC_SECRET=<random long secret>
USD_TO_INR=95.22
```

If you set the six `REVENUECAT_API_KEY_*` values, `REVENUECAT_API_KEY` can be left empty. The sync chooses an app-specific key first, then a project-specific key, then `REVENUECAT_API_KEYS`, then the shared `REVENUECAT_API_KEY` fallback.

After deployment, run a manual sync:

```bash
curl -X POST "https://<your-vercel-domain>/api/sync/all" \
  -H "Authorization: Bearer <SYNC_SECRET>"
```

Then open `https://<your-vercel-domain>`.

9. Configure GitHub Actions scheduler

Vercel only hosts the Next.js app. The every-6-hours sync is triggered by `.github/workflows/sync-all.yml`.

Add these repository secrets in GitHub Settings > Secrets and variables > Actions:

```txt
CMO_SYNC_URL=https://<your-vercel-domain>/api/sync/all
CMO_SYNC_SECRET=<same value as Vercel SYNC_SECRET>
```

Do not store RevenueCat, Windsor, or Supabase service-role keys in GitHub Actions. GitHub only needs the deployed sync URL and the shared sync secret.

The workflow runs on this UTC schedule:

```yaml
cron: "0 */6 * * *"
```

You can also run `Sync RevenueCat and Windsor` manually from the GitHub Actions tab.

After the first successful GitHub Actions run, verify recent sync status in Supabase:

```sql
select source, status, rows_synced, error_message, sync_started_at
from public.sync_runs
order by sync_started_at desc
limit 20;
```

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Notes

- All dashboard currency values are INR.
- USD RevenueCat values are converted using `USD_TO_INR=95.22`.
- The dashboard does not call RevenueCat or Windsor.ai during page loads.
- CAC is null when paid conversions are zero or missing.
- CPI is null when installs are zero or missing.
- Payback period is null unless paid conversions, active subscriptions, and net revenue are available.
- Data quality notes are surfaced for missing RevenueCat, Windsor, conversion, LTV, or payback inputs.
