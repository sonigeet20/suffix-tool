-- Script Scheduler Tables
create table if not exists public.script_scheduler_configs (
  id uuid primary key default gen_random_uuid(),
  offer_name text not null,
  account_id text not null,
  is_paused boolean not null default false,
  auto_schedule boolean not null default false,
  min_interval_seconds integer not null default 1800,
  last_allowed_at timestamptz,
  last_run_at timestamptz,
  last_run_duration_ms integer,
  next_earliest_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists script_scheduler_configs_offer_account_uidx
  on public.script_scheduler_configs(offer_name, account_id);

create table if not exists public.script_executions (
  id uuid primary key default gen_random_uuid(),
  offer_name text not null,
  account_id text not null,
  client text,
  version text,
  status text,
  started_at timestamptz,
  finished_at timestamptz,
  total_api_calls integer,
  total_campaigns_updated integer,
  total_campaigns_failed integer,
  created_at timestamptz not null default now()
);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_script_scheduler_configs_updated_at on public.script_scheduler_configs;
create trigger trg_script_scheduler_configs_updated_at
before update on public.script_scheduler_configs
for each row execute function public.set_updated_at();
