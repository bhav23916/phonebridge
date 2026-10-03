-- Keep paired devices visible while their WebSocket is offline, and store
-- push tokens separately so authenticated dashboard users cannot read them.

alter table public.phonebridge_devices
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_network_type text,
  add column if not exists last_network_at timestamptz,
  add column if not exists last_internet_available boolean;

create table if not exists public.phonebridge_device_push_tokens (
  device_id text primary key references public.phonebridge_devices(device_id) on delete cascade,
  fcm_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.phonebridge_device_push_tokens enable row level security;
revoke all on public.phonebridge_device_push_tokens from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.phonebridge_device_push_tokens to service_role;
