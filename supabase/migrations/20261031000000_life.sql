-- Phase 3: a player's life. Needs, job, home and the furniture in it.
--
-- Who can do what:
--   players  read their own character and home, nothing else here
--   the game server (secret key, bypasses row-level security) writes everything
-- Money still changes only through apply_ledger. The two functions below call it, so a purchase and its
-- ledger row either both happen or neither does.

create table public.characters (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  background     text not null check (background in ('comfortable', 'loan', 'newcomer', 'student')),
  -- hunger, energy, mood, hygiene, each 0 to 100
  needs          jsonb not null,
  -- seconds spent in the city; needs and bills only move while a player is here
  online_seconds bigint not null default 0 check (online_seconds >= 0),
  job            text,
  -- progress in each job: { "kitchen": { "level": 1, "shifts": 2 } }
  careers        jsonb not null default '{}'::jsonb,
  total_shifts   integer not null default 0 check (total_shifts >= 0),
  -- the unit rented, or null after an eviction
  unit           text check (unit in ('studio', 'flat', 'loft')),
  -- online_seconds at which the next bill is due
  next_due       bigint not null,
  -- cycles of rent missed, and what is still unpaid (late fees included)
  overdue        integer not null default 0 check (overdue >= 0),
  owing          bigint not null default 0 check (owing >= 0),
  debt           bigint not null default 0 check (debt >= 0),
  -- which getting-started steps are done: { "eat": true }
  tutorial       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated_at();

create table public.homes (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  -- the furniture standing in the home: [{ "id", "item", "x", "z", "rot" }]
  layout     jsonb not null default '[]'::jsonb check (jsonb_typeof(layout) = 'array' and jsonb_array_length(layout) <= 80),
  updated_at timestamptz not null default now()
);

create trigger homes_touch before update on public.homes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- creating a character: starting money, home and furniture in one step
-- ---------------------------------------------------------------------------

-- Returns true when the character was created, false when one already existed (safe to call again).
create function public.create_character(
  p_user uuid,
  p_background text,
  p_money bigint,
  p_debt bigint,
  p_unit text,
  p_needs jsonb,
  p_next_due bigint,
  p_layout jsonb,
  p_items jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
begin
  insert into public.characters (user_id, background, needs, unit, next_due, debt)
    values (p_user, p_background, p_needs, p_unit, p_next_due, p_debt)
    on conflict (user_id) do nothing;
  if not found then
    return false;
  end if;

  insert into public.homes (user_id, layout) values (p_user, p_layout) on conflict (user_id) do nothing;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.inventory (user_id, item_id, quantity)
      values (p_user, item ->> 'item', (item ->> 'qty')::integer)
      on conflict (user_id, item_id) do update set quantity = public.inventory.quantity + excluded.quantity;
  end loop;

  if p_money > 0 then
    perform public.apply_ledger(p_user, p_money, 'starting money', 'start');
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- buying an item: pay and receive, together
-- ---------------------------------------------------------------------------

-- Returns the new balance. A repeat with the same ref does nothing the second time, so a retry after a
-- dropped connection cannot charge twice or deliver twice. Not enough money raises `insufficient_funds`.
create function public.purchase_item(p_user uuid, p_item text, p_qty integer, p_unit_price bigint, p_ref text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_balance bigint;
begin
  if p_qty < 1 or p_unit_price < 1 then
    raise exception 'bad purchase' using errcode = 'invalid_parameter_value';
  end if;
  if p_ref is null then
    raise exception 'a purchase needs a ref' using errcode = 'invalid_parameter_value';
  end if;

  select balance_after into v_balance from public.ledger where user_id = p_user and ref = p_ref;
  if found then
    return v_balance;
  end if;

  v_balance := public.apply_ledger(p_user, -(p_qty * p_unit_price), 'purchase: ' || p_item, p_ref);
  insert into public.inventory (user_id, item_id, quantity) values (p_user, p_item, p_qty)
    on conflict (user_id, item_id) do update set quantity = public.inventory.quantity + excluded.quantity;
  return v_balance;
end $$;

-- ---------------------------------------------------------------------------
-- access
-- ---------------------------------------------------------------------------

alter table public.characters enable row level security;
alter table public.homes      enable row level security;

revoke all on public.characters, public.homes from anon, authenticated;

grant select on public.characters, public.homes to authenticated;
create policy characters_select_own on public.characters for select to authenticated using (user_id = (select auth.uid()));
create policy homes_select_own      on public.homes      for select to authenticated using (user_id = (select auth.uid()));

revoke execute on function public.create_character(uuid, text, bigint, bigint, text, jsonb, bigint, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.create_character(uuid, text, bigint, bigint, text, jsonb, bigint, jsonb, jsonb) to service_role;
revoke execute on function public.purchase_item(uuid, text, integer, bigint, text) from public, anon, authenticated;
grant  execute on function public.purchase_item(uuid, text, integer, bigint, text) to service_role;
