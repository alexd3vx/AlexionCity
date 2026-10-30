-- Assertions for the moderation tables. Run by run-local.sh after the data model checks.
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
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e1');

-- the game server (secret key) writes everything
set role service_role;
insert into public.blocks (blocker_id, blocked_id, blocked_name) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'Dee');
insert into public.reports (reporter_id, target_id, target_name, reason, details, context)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'Dee', 'harassment', 'followed me', '[{"text":"hi"}]');
insert into public.chat_log (channel, user_id, name, text) values ('downtown-1', '00000000-0000-0000-0000-0000000000d1', 'Dee', 'hello');
insert into public.chat_log (channel, user_id, name, text, created_at) values ('downtown-1', '00000000-0000-0000-0000-0000000000d1', 'Dee', 'ancient', now() - interval '90 days');
insert into public.mod_actions (target_id, kind, reason) values ('00000000-0000-0000-0000-0000000000d1', 'mute', 'spam');
select pg_temp.assert_eq('server can write moderation rows', (select count(*) from public.reports)::int, 1);

-- constraints
select pg_temp.expect_error($$insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1')$$, 'check constraint');
select pg_temp.expect_error($$insert into public.reports (target_name, reason) values ('x', 'because')$$, 'check constraint');
select pg_temp.expect_error($$insert into public.reports (target_name, reason, details) values ('x', 'spam', repeat('a', 501))$$, 'check constraint');
select pg_temp.expect_error($$insert into public.mod_actions (target_id, kind, reason) values ('00000000-0000-0000-0000-0000000000c1', 'kick', 'x')$$, 'check constraint');

-- chat retention
select pg_temp.assert_eq('purge removes only old chat', public.purge_old_chat(30), 1::bigint);
select pg_temp.assert_eq('recent chat is kept', (select count(*) from public.chat_log)::int, 1);
reset role;

-- a player: sees only their own block list, can read and change nothing else
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.assert_eq('player sees their own blocks', (select count(*) from public.blocks)::int, 1);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
select pg_temp.assert_eq('player does not see blocks against them', (select count(*) from public.blocks)::int, 0);

select pg_temp.expect_error($$select * from public.reports$$, 'permission denied');
select pg_temp.expect_error($$select * from public.chat_log$$, 'permission denied');
select pg_temp.expect_error($$select * from public.mod_actions$$, 'permission denied');
select pg_temp.expect_error($$insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1')$$, 'permission denied');
select pg_temp.expect_error($$delete from public.blocks$$, 'permission denied');
select pg_temp.expect_error($$insert into public.reports (target_name, reason) values ('x', 'spam')$$, 'permission denied');
select pg_temp.expect_error($$insert into public.mod_actions (target_id, kind, reason) values ('00000000-0000-0000-0000-0000000000d1', 'ban', 'x')$$, 'permission denied');
select pg_temp.expect_error($$select public.purge_old_chat(0)$$, 'permission denied');
reset role;

set role anon;
select pg_temp.expect_error($$select * from public.blocks$$, 'permission denied');
reset role;

-- right to deletion: a deleted account loses its blocks and sanctions; the report about them survives, anonymised
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.assert_eq('blocks naming a deleted account go with it', (select count(*) from public.blocks)::int, 0);
select pg_temp.assert_eq('sanctions go with the account', (select count(*) from public.mod_actions)::int, 0);
select pg_temp.assert_eq('the report survives with the target cleared', (select count(*) from public.reports where target_id is null)::int, 1);
select pg_temp.assert_eq('chat keeps the text, not the account', (select count(*) from public.chat_log where user_id is null)::int, 1);

\echo ALL MODERATION CHECKS PASSED
