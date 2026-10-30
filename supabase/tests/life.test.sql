-- Assertions for the life tables and functions. Run by run-local.sh after the other checks.
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

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2');

set role service_role;

-- creating a character gives money, a home and furniture in one step
select pg_temp.assert_eq('a new character is created',
  public.create_character('00000000-0000-0000-0000-0000000000f1', 'newcomer', 400, 0, 'studio',
    '{"hunger":80,"energy":85,"mood":70,"hygiene":85}', 3600,
    '[{"id":"s0","item":"furniture:bed-single","x":0,"z":3,"rot":0}]',
    '[{"item":"furniture:bed-single","qty":1},{"item":"furniture:shower","qty":1}]'), true);
select pg_temp.assert_eq('starting money arrives through the ledger',
  (select balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000f1'), 400::bigint);
select pg_temp.assert_eq('the starting money is one ledger row',
  (select count(*) from public.ledger where user_id = '00000000-0000-0000-0000-0000000000f1' and reason = 'starting money')::int, 1);
select pg_temp.assert_eq('starter furniture is in the inventory',
  (select count(*) from public.inventory where user_id = '00000000-0000-0000-0000-0000000000f1')::int, 2);
select pg_temp.assert_eq('the home holds the layout',
  jsonb_array_length((select layout from public.homes where user_id = '00000000-0000-0000-0000-0000000000f1')), 1);

-- asking again changes nothing
select pg_temp.assert_eq('creating twice is harmless',
  public.create_character('00000000-0000-0000-0000-0000000000f1', 'comfortable', 9999, 0, 'loft', '{}', 1, '[]', '[]'), false);
select pg_temp.assert_eq('the first background stands',
  (select background from public.characters where user_id = '00000000-0000-0000-0000-0000000000f1'), 'newcomer');
select pg_temp.assert_eq('the money was not granted again',
  (select balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000f1'), 400::bigint);

-- purchases are atomic and safe to retry
select pg_temp.assert_eq('a purchase charges and delivers',
  public.purchase_item('00000000-0000-0000-0000-0000000000f1', 'furniture:plant', 2, 35, 'buy:1'), 330::bigint);
select pg_temp.assert_eq('the item arrives',
  (select quantity from public.inventory where user_id = '00000000-0000-0000-0000-0000000000f1' and item_id = 'furniture:plant'), 2);
select pg_temp.assert_eq('a retry with the same ref returns the same balance',
  public.purchase_item('00000000-0000-0000-0000-0000000000f1', 'furniture:plant', 2, 35, 'buy:1'), 330::bigint);
select pg_temp.assert_eq('and does not deliver twice',
  (select quantity from public.inventory where user_id = '00000000-0000-0000-0000-0000000000f1' and item_id = 'furniture:plant'), 2);
select pg_temp.assert_eq('and does not charge twice',
  (select balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000f1'), 330::bigint);

select pg_temp.expect_error($$select public.purchase_item('00000000-0000-0000-0000-0000000000f1', 'furniture:sofa', 1, 240000, 'buy:2')$$, 'insufficient_funds');
select pg_temp.assert_eq('a failed purchase delivers nothing',
  (select count(*) from public.inventory where user_id = '00000000-0000-0000-0000-0000000000f1' and item_id = 'furniture:sofa')::int, 0);
select pg_temp.assert_eq('a failed purchase charges nothing',
  (select balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000f1'), 330::bigint);
select pg_temp.expect_error($$select public.purchase_item('00000000-0000-0000-0000-0000000000f1', 'x', 0, 10, 'buy:3')$$, 'bad purchase');
select pg_temp.expect_error($$select public.purchase_item('00000000-0000-0000-0000-0000000000f1', 'x', 1, 10, null)$$, 'needs a ref');

-- constraints
select pg_temp.expect_error($$insert into public.characters (user_id, background, needs, next_due) values ('00000000-0000-0000-0000-0000000000f2', 'royal', '{}', 1)$$, 'check constraint');
select pg_temp.expect_error($$insert into public.characters (user_id, background, needs, unit, next_due) values ('00000000-0000-0000-0000-0000000000f2', 'loan', '{}', 'castle', 1)$$, 'check constraint');
select pg_temp.expect_error($$update public.characters set owing = -1 where user_id = '00000000-0000-0000-0000-0000000000f1'$$, 'check constraint');
select pg_temp.expect_error($$update public.homes set layout = '{}'::jsonb where user_id = '00000000-0000-0000-0000-0000000000f1'$$, 'check constraint');
reset role;

-- a player reads only their own character and home, and changes nothing
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select pg_temp.assert_eq('a player sees their own character', (select count(*) from public.characters)::int, 1);
select pg_temp.assert_eq('a player sees their own home', (select count(*) from public.homes)::int, 1);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
select pg_temp.assert_eq('another player sees none of it', (select count(*) from public.characters)::int, 0);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select pg_temp.expect_error($$update public.characters set needs = '{"hunger":100}'$$, 'permission denied');
select pg_temp.expect_error($$update public.homes set layout = '[]'$$, 'permission denied');
select pg_temp.expect_error($$insert into public.characters (user_id, background, needs, next_due) values ('00000000-0000-0000-0000-0000000000f1', 'loan', '{}', 1)$$, 'permission denied');
select pg_temp.expect_error($$delete from public.homes$$, 'permission denied');
select pg_temp.expect_error($$select public.purchase_item('00000000-0000-0000-0000-0000000000f1', 'furniture:plant', 1, 1, 'cheat:1')$$, 'permission denied');
select pg_temp.expect_error($$select public.create_character('00000000-0000-0000-0000-0000000000f2', 'comfortable', 999999, 0, 'loft', '{}', 1, '[]', '[]')$$, 'permission denied');
reset role;

set role anon;
select pg_temp.expect_error($$select * from public.characters$$, 'permission denied');
reset role;

-- right to deletion: a deleted account takes its character and home with it
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.assert_eq('the character goes with the account', (select count(*) from public.characters)::int, 0);
select pg_temp.assert_eq('the home goes with the account', (select count(*) from public.homes)::int, 0);

\echo ALL LIFE CHECKS PASSED
