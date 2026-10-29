-- AlexionCity data model v0: profiles, wallet, append-only ledger, inventory.
--
-- The rule this file exists to enforce: players can READ their own money and items, but only the
-- server (service_role) can CHANGE them. The game server calls apply_ledger(); the browser cannot.

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) between 2 and 20),
  -- self-declared: the player confirmed they are 13 or older
  age_ok       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.wallets (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- every change to a balance is one row here; rows are never edited
create table public.ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  delta         bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason        text not null,
  -- caller-chosen key that makes a retry safe: the same (user_id, ref) applies only once
  ref           text,
  created_at    timestamptz not null default now()
);
create unique index ledger_user_ref_key on public.ledger (user_id, ref) where ref is not null;
create index ledger_user_created_idx on public.ledger (user_id, created_at desc);

create table public.inventory (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  item_id  text not null,
  quantity integer not null check (quantity > 0),
  primary key (user_id, item_id)
);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- a new auth user (including an anonymous guest) gets a profile and an empty wallet
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.wallets (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- the ledger is append-only: no edits, even from the server
create function public.ledger_block_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ledger rows cannot be changed' using errcode = 'restrict_violation';
end $$;

create trigger ledger_no_update before update on public.ledger
  for each row execute function public.ledger_block_update();

-- ---------------------------------------------------------------------------
-- the only way money changes
-- ---------------------------------------------------------------------------

create function public.apply_ledger(p_user uuid, p_delta bigint, p_reason text, p_ref text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_balance bigint;
  v_existing bigint;
begin
  if p_delta = 0 then
    raise exception 'delta must not be zero' using errcode = 'invalid_parameter_value';
  end if;

  -- a retry with the same ref returns the earlier result instead of applying twice
  if p_ref is not null then
    select balance_after into v_existing from public.ledger where user_id = p_user and ref = p_ref;
    if found then return v_existing; end if;
  end if;

  select balance into v_balance from public.wallets where user_id = p_user for update;
  if not found then
    raise exception 'no wallet for user' using errcode = 'no_data_found';
  end if;
  if v_balance + p_delta < 0 then
    raise exception 'insufficient_funds' using errcode = 'check_violation';
  end if;

  update public.wallets set balance = v_balance + p_delta, updated_at = now() where user_id = p_user;
  insert into public.ledger (user_id, delta, balance_after, reason, ref)
    values (p_user, p_delta, v_balance + p_delta, p_reason, p_ref);
  return v_balance + p_delta;
end $$;

-- ---------------------------------------------------------------------------
-- access: row-level security plus explicit grants
-- ---------------------------------------------------------------------------
-- Supabase grants new public tables to anon and authenticated by default, so take everything away
-- first and add back only what players may do.

alter table public.profiles  enable row level security;
alter table public.wallets   enable row level security;
alter table public.ledger    enable row level security;
alter table public.inventory enable row level security;

revoke all on public.profiles, public.wallets, public.ledger, public.inventory from anon, authenticated;

-- profiles: read and edit your own row, and only these columns
grant select on public.profiles to authenticated;
grant update (username, display_name, age_ok) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- money and items: read your own, never write
grant select on public.wallets, public.ledger, public.inventory to authenticated;
create policy wallets_select_own   on public.wallets   for select to authenticated using (user_id = (select auth.uid()));
create policy ledger_select_own    on public.ledger    for select to authenticated using (user_id = (select auth.uid()));
create policy inventory_select_own on public.inventory for select to authenticated using (user_id = (select auth.uid()));

-- only the server can call apply_ledger
revoke execute on function public.apply_ledger(uuid, bigint, text, text) from public, anon, authenticated;
grant  execute on function public.apply_ledger(uuid, bigint, text, text) to service_role;

-- the trigger functions are not callable by players either
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.ledger_block_update() from public, anon, authenticated;
