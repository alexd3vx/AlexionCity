-- Assertions for the data model. Run by run-local.sh; any failed check aborts with an error.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm like '%' || expected || '%' then return; end if;
    raise exception 'wanted an error containing "%", got "%"  (sql: %)', expected, sqlerrm, sql;
  end;
  raise exception 'wanted an error containing "%", but the statement succeeded (sql: %)', expected, sql;
end $$;

create function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;

-- two players
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

select pg_temp.assert_eq('new user gets a profile', (select count(*) from public.profiles)::int, 2);
select pg_temp.assert_eq('new user gets a wallet at zero', (select sum(balance) from public.wallets)::int, 0);

-- the server pays player A
set role service_role;
select pg_temp.assert_eq('server can add money', public.apply_ledger('00000000-0000-0000-0000-00000000000a', 100, 'shift'), 100::bigint);
select pg_temp.assert_eq('server can spend money', public.apply_ledger('00000000-0000-0000-0000-00000000000a', -30, 'snack'), 70::bigint);
select pg_temp.expect_error($$select public.apply_ledger('00000000-0000-0000-0000-00000000000a', -100, 'too much')$$, 'insufficient_funds');
select pg_temp.assert_eq('failed spend leaves the balance alone', (select balance from public.wallets where user_id = '00000000-0000-0000-0000-00000000000a'), 70::bigint);
select pg_temp.assert_eq('first use of a ref applies', public.apply_ledger('00000000-0000-0000-0000-00000000000a', 50, 'bonus', 'daily-1'), 120::bigint);
select pg_temp.assert_eq('a retry with the same ref does not apply twice', public.apply_ledger('00000000-0000-0000-0000-00000000000a', 50, 'bonus', 'daily-1'), 120::bigint);
select pg_temp.assert_eq('ledger has one row per real change', (select count(*) from public.ledger)::int, 3);
select pg_temp.expect_error($$update public.ledger set delta = 1$$, 'ledger rows cannot be changed');
select pg_temp.expect_error($$select public.apply_ledger('00000000-0000-0000-0000-00000000000a', 0, 'noop')$$, 'delta must not be zero');
reset role;

-- player A, as the browser would act
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

select pg_temp.assert_eq('player sees their own wallet', (select balance from public.wallets), 120::bigint);
select pg_temp.assert_eq('player sees only their own wallet row', (select count(*) from public.wallets)::int, 1);
select pg_temp.assert_eq('player sees only their own ledger', (select count(*) from public.ledger)::int, 3);
select pg_temp.assert_eq('player sees only their own profile', (select count(*) from public.profiles)::int, 1);

select pg_temp.expect_error($$update public.wallets set balance = 1000000$$, 'permission denied');
select pg_temp.expect_error($$insert into public.ledger (user_id, delta, balance_after, reason) values ('00000000-0000-0000-0000-00000000000a', 5, 5, 'x')$$, 'permission denied');
select pg_temp.expect_error($$delete from public.ledger$$, 'permission denied');
select pg_temp.expect_error($$insert into public.inventory (user_id, item_id, quantity) values ('00000000-0000-0000-0000-00000000000a', 'car', 1)$$, 'permission denied');
select pg_temp.expect_error($$select public.apply_ledger('00000000-0000-0000-0000-00000000000a', 1000000, 'cheat')$$, 'permission denied');

-- allowed edits: own name fields
update public.profiles set display_name = 'Ada', username = 'ada_1', age_ok = true;
select pg_temp.assert_eq('player can set their display name', (select display_name from public.profiles), 'Ada'::text);
select pg_temp.expect_error($$update public.profiles set id = gen_random_uuid()$$, 'permission denied');
select pg_temp.expect_error($$update public.profiles set username = 'No Spaces!'$$, 'check constraint');

-- player A cannot touch player B
do $$
declare n int;
begin
  update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL player edited another player profile'; end if;
  raise notice 'ok   cannot edit another player profile';
end $$;

-- an anonymous (not logged in) caller sees nothing
reset role;
set role anon;
select pg_temp.expect_error($$select * from public.wallets$$, 'permission denied');
select pg_temp.expect_error($$select * from public.profiles$$, 'permission denied');
reset role;

-- deleting an account removes its data (right to deletion)
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.assert_eq('deleting a user removes their wallet and ledger', (select count(*) from public.wallets)::int + (select count(*) from public.ledger)::int, 1);

\echo ALL DATA MODEL CHECKS PASSED
