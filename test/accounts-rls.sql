-- Run on a local/test Supabase DB after all migrations. Fixtures roll back.
begin;
do $$ begin
 if not (select relrowsecurity from pg_class where oid='private.app_usage'::regclass) then
  raise exception 'usage ledger RLS is disabled';
 end if;
 if has_table_privilege('anon','private.app_usage','SELECT')
   or has_table_privilege('authenticated','private.app_usage','SELECT')
   or has_table_privilege('authenticated','private.app_usage','UPDATE') then
  raise exception 'client has usage ledger privileges';
 end if;
end $$;
-- Only in a test database: temporarily replace the bootstrap master; rollback restores it.
update public.accounts set role='free' where role='master';
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','master@example.test'),
 ('22222222-2222-4222-8222-222222222222','free@example.test'),
 ('33333333-3333-4333-8333-333333333333','pro@example.test');
update public.accounts set role='master' where user_id='11111111-1111-4111-8111-111111111111';

set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 begin
   perform * from private.app_usage; raise exception 'client read usage ledger';
 exception when insufficient_privilege then null; end;
 if public.can_use_app('wishlist') then raise exception 'backend defaults must deny free users'; end if;
 if not public.can_use_app('qr-code') then raise exception 'local apps should be available'; end if;
 if (public.account_access()->>'role') <> 'free' then raise exception 'signup role incorrect'; end if;
 begin
   update public.accounts set role='master' where user_id=auth.uid();
   raise exception 'self promotion accepted';
 exception when insufficient_privilege then null; end;
 begin
   perform public.admin_accounts(); raise exception 'free user read accounts';
 exception when insufficient_privilege then null; end;
 begin
   perform public.admin_set_app('qr-code',true,500); raise exception 'free user changed limits';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.utility_configs(user_id,utility_id) values(auth.uid(),'wishlist');
   raise exception 'direct denied app save accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.admin_set_app('qr-code',true,1000);
select public.admin_set_account('33333333-3333-4333-8333-333333333333','pro',false);
select public.admin_set_account_app('22222222-2222-4222-8222-222222222222','wishlist',true,10000);
do $$ begin
 begin
   perform public.admin_set_account(auth.uid(),'free',false); raise exception 'master demotion accepted';
 exception when raise_exception then if sqlerrm not like 'Account unavailable%' then raise; end if; end;
 if jsonb_array_length(public.admin_accounts()->'accounts') < 3 then raise exception 'admin listing incomplete'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
insert into public.utility_configs(user_id,utility_id,config) values(auth.uid(),'qr-code','{"hello":"world"}');
do $$ begin
 begin
  insert into public.qr_codes(user_id,name,content_type,data) values(auth.uid(),'Too big','text',jsonb_build_object('text',repeat('x',2000)));
  raise exception 'quota overflow accepted';
 exception when check_violation then null; end;
 begin
  update public.utility_configs set config=jsonb_build_object('text',repeat('x',2000)) where utility_id='qr-code';
  raise exception 'update bypassed quota';
 exception when check_violation then null; end;
 if (select config->>'hello' from public.utility_configs where utility_id='qr-code') <> 'world' then raise exception 'quota failure did not rollback'; end if;
 begin
  insert into public.utility_configs(user_id,utility_id) values('33333333-3333-4333-8333-333333333333','qr-code');
  raise exception 'cross-account insert accepted';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.qr_codes(user_id,name,content_type) values(auth.uid(),'Small','text');
do $$ begin
 begin
  insert into public.qr_codes(user_id,name,content_type,data)
   select auth.uid(),'Batch','text',jsonb_build_object('payload',repeat('x',150)) from generate_series(1,4);
  raise exception 'bulk save bypassed quota';
 exception when check_violation then null; end;
 if (select count(*) from public.qr_codes) <> 1 then raise exception 'bulk failure partially saved'; end if;
end $$;
reset role;
do $$ declare actual bigint; expected bigint; begin
 select bytes into actual from private.app_usage where user_id='22222222-2222-4222-8222-222222222222' and app_id='qr-code';
 select (select sum(octet_length(to_jsonb(c)::text)) from public.utility_configs c where user_id='22222222-2222-4222-8222-222222222222' and utility_id='qr-code') +
 (select sum(octet_length(to_jsonb(q)::text)) from public.qr_codes q where user_id='22222222-2222-4222-8222-222222222222') into expected;
 if actual <> expected then raise exception 'combined quota ledger incorrect: % / %',actual,expected; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.admin_set_app('qr-code',true,0);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
update public.utility_configs set config='{}' where utility_id='qr-code';
delete from public.qr_codes;
delete from public.utility_configs;
insert into public.wishlist_collections(id,name,share_token) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Test','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.wishlist_items(id,collection_id,title,url) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Test','https://example.com/item');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
delete from public.wishlist_collections;
reset role;
do $$ begin
 if exists(select 1 from private.app_usage where user_id='22222222-2222-4222-8222-222222222222' and bytes <> 0) then raise exception 'delete/cascade did not release quota'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
insert into public.utility_configs(user_id,utility_id,config) values(auth.uid(),'wishlist',jsonb_build_object('large',repeat('x',20000)));
do $$ begin
 if not public.can_use_app('wishlist') then raise exception 'pro restricted'; end if;
 if exists(select 1 from jsonb_array_elements(public.account_access()->'apps') a where a->>'max_bytes' is not null) then raise exception 'pro quota present'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.admin_set_account('33333333-3333-4333-8333-333333333333','pro',true);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if public.can_use_app('wishlist') then raise exception 'suspended pro has access'; end if;
 if exists(select 1 from public.utility_configs) then raise exception 'suspended read accepted'; end if;
 begin
 insert into public.utility_configs(user_id,utility_id) values(auth.uid(),'qr-code'); raise exception 'suspended save accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.admin_set_account('33333333-3333-4333-8333-333333333333','pro',false);
select public.admin_set_app('wishlist',false,500,'pro');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if public.can_use_app('wishlist') then raise exception 'pro type restriction ignored'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.admin_set_app('wishlist',true,500,'pro');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 begin
  update public.utility_configs set config=jsonb_build_object('large',repeat('z',30000)) where utility_id='wishlist';
  raise exception 'configured pro quota bypassed';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.admin_set_account_app('33333333-3333-4333-8333-333333333333','wishlist',true,null);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if not public.can_use_app('wishlist') then raise exception 'per-account override ignored'; end if;
end $$;
update public.utility_configs set config=jsonb_build_object('large',repeat('y',40000)) where utility_id='wishlist';
rollback;
