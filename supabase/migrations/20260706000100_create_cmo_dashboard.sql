create extension if not exists pgcrypto with schema extensions;

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  app_name text unique not null,
  revenuecat_project_id text,
  revenuecat_app_id text,
  windsor_app_names text[] default '{}',
  campaign_aliases text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.daily_revenue (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  app_id uuid references public.apps(id) on delete cascade,
  revenue_inr numeric default 0,
  expected_ltv_inr numeric default 0,
  refunds_inr numeric default 0,
  net_revenue_inr numeric default 0,
  trials integer default 0,
  paid_conversions integer default 0,
  active_subscriptions integer default 0,
  cancellations integer default 0,
  source text default 'revenuecat',
  source_last_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint daily_revenue_date_app_unique unique (date, app_id)
);

create table if not exists public.daily_ad_spend (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  app_id uuid references public.apps(id) on delete cascade,
  source text,
  medium text,
  campaign text,
  campaign_id text,
  ad_group text,
  ad_group_id text,
  keyword text,
  country text,
  spend_inr numeric default 0,
  impressions integer default 0,
  clicks integer default 0,
  installs integer default 0,
  conversions integer default 0,
  source_last_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists daily_ad_spend_unique_daily_dimension
  on public.daily_ad_spend (
    date,
    app_id,
    source,
    medium,
    campaign,
    campaign_id,
    ad_group,
    ad_group_id,
    keyword,
    country
  )
  nulls not distinct;

create table if not exists public.other_costs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  app_id uuid references public.apps(id) on delete cascade,
  cost_name text,
  amount_inr numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  sync_started_at timestamptz default now(),
  sync_finished_at timestamptz,
  status text,
  rows_synced integer default 0,
  error_message text
);

create index if not exists daily_revenue_date_idx on public.daily_revenue (date);
create index if not exists daily_revenue_app_idx on public.daily_revenue (app_id);
create index if not exists daily_ad_spend_date_idx on public.daily_ad_spend (date);
create index if not exists daily_ad_spend_app_idx on public.daily_ad_spend (app_id);
create index if not exists other_costs_date_idx on public.other_costs (date);
create index if not exists sync_runs_source_started_idx on public.sync_runs (source, sync_started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_daily_revenue_updated_at on public.daily_revenue;
create trigger set_daily_revenue_updated_at
before update on public.daily_revenue
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_ad_spend_updated_at on public.daily_ad_spend;
create trigger set_daily_ad_spend_updated_at
before update on public.daily_ad_spend
for each row execute function public.set_updated_at();

alter table public.apps enable row level security;
alter table public.daily_revenue enable row level security;
alter table public.daily_ad_spend enable row level security;
alter table public.other_costs enable row level security;
alter table public.sync_runs enable row level security;

create or replace view public.daily_pnl
with (security_invoker = true)
as
with daily_spend as (
  select
    date,
    app_id,
    sum(spend_inr)::numeric as ad_spend_inr,
    sum(impressions)::integer as impressions,
    sum(clicks)::integer as clicks,
    sum(installs)::integer as installs,
    sum(conversions)::integer as conversions
  from public.daily_ad_spend
  group by date, app_id
),
daily_costs as (
  select
    date,
    app_id,
    sum(amount_inr)::numeric as other_costs_inr
  from public.other_costs
  group by date, app_id
),
date_app_pairs as (
  select date, app_id from public.daily_revenue
  union
  select date, app_id from public.daily_ad_spend
  union
  select date, app_id from public.other_costs
),
base as (
  select
    pairs.date,
    apps.app_name,
    coalesce(revenue.revenue_inr, 0)::numeric as revenue_inr,
    coalesce(revenue.expected_ltv_inr, 0)::numeric as expected_ltv_inr,
    coalesce(spend.ad_spend_inr, 0)::numeric as ad_spend_inr,
    coalesce(costs.other_costs_inr, 0)::numeric as other_costs_inr,
    coalesce(revenue.net_revenue_inr, 0)::numeric as net_revenue_inr,
    coalesce(revenue.trials, 0)::integer as trials,
    coalesce(revenue.paid_conversions, 0)::integer as paid_conversions,
    coalesce(revenue.active_subscriptions, 0)::integer as active_subscriptions,
    coalesce(revenue.cancellations, 0)::integer as cancellations,
    revenue.id is not null as has_revenue_data,
    spend.app_id is not null as has_ad_spend_data
  from date_app_pairs pairs
  join public.apps apps on apps.id = pairs.app_id
  left join public.daily_revenue revenue
    on revenue.date = pairs.date and revenue.app_id = pairs.app_id
  left join daily_spend spend
    on spend.date = pairs.date and spend.app_id = pairs.app_id
  left join daily_costs costs
    on costs.date = pairs.date and costs.app_id = pairs.app_id
  where apps.is_active = true
)
select
  date,
  app_name,
  revenue_inr,
  expected_ltv_inr,
  ad_spend_inr,
  other_costs_inr,
  net_revenue_inr,
  (net_revenue_inr - ad_spend_inr - other_costs_inr)::numeric as profit_loss_revenue_inr,
  (expected_ltv_inr - ad_spend_inr - other_costs_inr)::numeric as profit_loss_expected_ltv_inr,
  case when ad_spend_inr > 0 then (net_revenue_inr / ad_spend_inr)::numeric else null end as revenue_roas,
  case when ad_spend_inr > 0 then (expected_ltv_inr / ad_spend_inr)::numeric else null end as expected_ltv_roas,
  case when paid_conversions > 0 then (ad_spend_inr / paid_conversions)::numeric else null end as cac,
  case
    when paid_conversions > 0 and active_subscriptions > 0 and net_revenue_inr > 0
    then ((ad_spend_inr / paid_conversions) / (net_revenue_inr / active_subscriptions))::numeric
    else null
  end as payback_period,
  trials,
  paid_conversions,
  active_subscriptions,
  cancellations,
  has_revenue_data,
  has_ad_spend_data,
  concat_ws(
    '; ',
    case when has_revenue_data = false then 'RevenueCat data missing' end,
    case when has_ad_spend_data = false then 'Windsor spend data missing' end,
    case when paid_conversions <= 0 then 'CAC unavailable' end,
    case when active_subscriptions <= 0 or net_revenue_inr <= 0 then 'Payback unavailable' end,
    case when expected_ltv_inr <= 0 then 'Expected LTV missing' end
  ) as data_quality_note
from base;

revoke all on table public.apps from anon, authenticated;
revoke all on table public.daily_revenue from anon, authenticated;
revoke all on table public.daily_ad_spend from anon, authenticated;
revoke all on table public.other_costs from anon, authenticated;
revoke all on table public.sync_runs from anon, authenticated;
revoke all on table public.daily_pnl from anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
