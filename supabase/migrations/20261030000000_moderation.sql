-- Phase 2: player safety. Blocks, reports, a chat log for moderators, and moderation actions.
--
-- Who can do what:
--   players  read their own block list, nothing else here
--   the game server (secret key, bypasses row-level security) writes everything here
-- A player can never read reports about them, the chat log, or sanctions, and can never write any of it.

-- Players who signed in before the data model existed (guests created during development, for example)
-- get their profile and wallet now. Safe to run again: existing rows are left alone.
insert into public.profiles (id) select id from auth.users on conflict do nothing;
insert into public.wallets (user_id) select id from public.profiles on conflict do nothing;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.blocks (
  blocker_id   uuid not null references public.profiles (id) on delete cascade,
  blocked_id   uuid not null references public.profiles (id) on delete cascade,
  -- the name at the time, so the block list still reads well when the other player is offline
  blocked_name text not null default '',
  created_at   timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          bigint generated always as identity primary key,
  -- kept as null if either account is later deleted, so the report itself survives
  reporter_id uuid references public.profiles (id) on delete set null,
  target_id   uuid references public.profiles (id) on delete set null,
  target_name text not null,
  reason      text not null check (reason in ('harassment', 'spam', 'inappropriate_name', 'cheating', 'other')),
  details     text not null default '' check (char_length(details) <= 500),
  channel     text not null default '',
  -- the recent chat around the incident, copied at report time
  context     jsonb not null default '[]'::jsonb,
  status      text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_id);

create table public.chat_log (
  id         bigint generated always as identity primary key,
  channel    text not null,
  user_id    uuid references public.profiles (id) on delete set null,
  name       text not null,
  text       text not null,
  created_at timestamptz not null default now()
);
create index chat_log_created_idx on public.chat_log (created_at);
create index chat_log_user_idx on public.chat_log (user_id, created_at desc);

create table public.mod_actions (
  id         bigint generated always as identity primary key,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('ban', 'mute')),
  reason     text not null,
  -- null means no end date
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index mod_actions_target_idx on public.mod_actions (target_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- chat retention
-- ---------------------------------------------------------------------------
-- The chat log exists so moderators can review reports. Keep it only as long as that needs; schedule
-- this (for example with pg_cron, or a daily job on the game server) and publish the retention in the
-- privacy policy.

create function public.purge_old_chat(p_days integer default 30) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  removed bigint;
begin
  delete from public.chat_log where created_at < now() - make_interval(days => p_days);
  get diagnostics removed = row_count;
  return removed;
end $$;

-- ---------------------------------------------------------------------------
-- access
-- ---------------------------------------------------------------------------

alter table public.blocks      enable row level security;
alter table public.reports     enable row level security;
alter table public.chat_log    enable row level security;
alter table public.mod_actions enable row level security;

revoke all on public.blocks, public.reports, public.chat_log, public.mod_actions from anon, authenticated;

grant select on public.blocks to authenticated;
create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));

revoke execute on function public.purge_old_chat(integer) from public, anon, authenticated;
grant  execute on function public.purge_old_chat(integer) to service_role;
