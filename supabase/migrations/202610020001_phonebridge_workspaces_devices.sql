-- PhoneBridge account and device ownership foundation.
-- Run once in Supabase SQL Editor before deploying the updated server.

create table if not exists public.phonebridge_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.phonebridge_workspace_members (
  workspace_id uuid not null references public.phonebridge_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists phonebridge_workspace_members_user_idx
  on public.phonebridge_workspace_members (user_id, joined_at);

create table if not exists public.phonebridge_devices (
  device_id text primary key,
  workspace_id uuid not null references public.phonebridge_workspaces(id) on delete cascade,
  paired_by uuid not null references auth.users(id),
  device_token_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists phonebridge_devices_workspace_idx
  on public.phonebridge_devices (workspace_id, created_at desc);

alter table public.phonebridge_workspaces enable row level security;
alter table public.phonebridge_workspace_members enable row level security;
alter table public.phonebridge_devices enable row level security;

drop policy if exists "Workspace members can view their workspaces" on public.phonebridge_workspaces;
create policy "Workspace members can view their workspaces"
  on public.phonebridge_workspaces for select to authenticated
  using (
    exists (
      select 1 from public.phonebridge_workspace_members m
      where m.workspace_id = public.phonebridge_workspaces.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can view their own memberships" on public.phonebridge_workspace_members;
create policy "Users can view their own memberships"
  on public.phonebridge_workspace_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Workspace members can view paired devices" on public.phonebridge_devices;
create policy "Workspace members can view paired devices"
  on public.phonebridge_devices for select to authenticated
  using (
    exists (
      select 1 from public.phonebridge_workspace_members m
      where m.workspace_id = public.phonebridge_devices.workspace_id and m.user_id = (select auth.uid())
    )
  );

revoke all on public.phonebridge_workspaces from anon, authenticated;
revoke all on public.phonebridge_workspace_members from anon, authenticated;
revoke all on public.phonebridge_devices from anon, authenticated;
grant select on public.phonebridge_workspaces to authenticated;
grant select on public.phonebridge_workspace_members to authenticated;
grant select on public.phonebridge_devices to authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.phonebridge_workspaces to service_role;
grant select, insert, update, delete on public.phonebridge_workspace_members to service_role;
grant select, insert, update, delete on public.phonebridge_devices to service_role;

create or replace function public.phonebridge_create_workspace_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  workspace_label text;
begin
  workspace_label := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(new.email, 'PhoneBridge user'), '@', 1), ''),
    'PhoneBridge user'
  ) || '''s PhoneBridge';

  insert into public.phonebridge_workspaces (name, created_by)
  values (workspace_label, new.id)
  returning id into new_workspace_id;

  insert into public.phonebridge_workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists phonebridge_create_workspace_after_signup on auth.users;
create trigger phonebridge_create_workspace_after_signup
  after insert on auth.users
  for each row execute function public.phonebridge_create_workspace_for_new_user();
