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

- `REVENUECAT_API_KEY`: RevenueCat v2 secret key with charts/metrics permissions.
- `WINDSOR_API_KEY`: Windsor.ai API key.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key, server only.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable key.
- `SYNC_SECRET`: shared secret for manual sync API routes.
- `CRON_SECRET`: optional Vercel Cron secret. If set in Vercel, Vercel sends it as `Authorization: Bearer`.
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
curl -X POST "http://localhost:3000/api/sync/revenuecat?secret=$SYNC_SECRET"
curl -X POST "http://localhost:3000/api/sync/windsor?secret=$SYNC_SECRET"
curl -X POST "http://localhost:3000/api/sync/all?secret=$SYNC_SECRET"
```

Optional date range:

```bash
curl -X POST "http://localhost:3000/api/sync/all?secret=$SYNC_SECRET&date_from=2026-07-01&date_to=2026-07-06"
```

8. Deploy to Vercel

Set all env vars in Vercel. Only `NEXT_PUBLIC_*` values are exposed to the browser. `SUPABASE_SERVICE_ROLE_KEY`, `REVENUECAT_API_KEY`, `WINDSOR_API_KEY`, `SYNC_SECRET`, and `CRON_SECRET` must stay server-only.

Required Vercel environment values:

```txt
SUPABASE_URL=https://skcvmktjwqdgggeqscnq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard, server only>
NEXT_PUBLIC_SUPABASE_URL=https://skcvmktjwqdgggeqscnq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase publishable key>
REVENUECAT_API_KEY=<RevenueCat secret API key>
WINDSOR_API_KEY=<Windsor.ai API key>
WINDSOR_CONNECTOR=apple_search_ads
SYNC_SECRET=<random long secret>
CRON_SECRET=<random long secret, can match SYNC_SECRET>
USD_TO_INR=95.22
```

After deployment, run a manual sync:

```bash
curl -X POST "https://<your-vercel-domain>/api/sync/all" \
  -H "Authorization: Bearer <SYNC_SECRET>"
```

Then open `https://<your-vercel-domain>`.

9. Configure cron

`vercel.json` schedules:

```json
{
  "path": "/api/cron/sync-all",
  "schedule": "0 */6 * * *"
}
```

The cron route accepts `Authorization: Bearer CRON_SECRET`, `Authorization: Bearer SYNC_SECRET`, or `?secret=...`.

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
