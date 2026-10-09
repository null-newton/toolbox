-- Local/test database only. All fixture records and deletions roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('44444444-4444-4444-8444-444444444444','privacy@example.test','{}'),
 ('55555555-5555-4555-8555-555555555555','other@example.test','{"terms_version":"2026-10-09","privacy_version":"2026-10-09","adult_attested":true}');
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ begin
 if public.can_use_app('qr-code') then raise exception 'unaccepted account can use apps'; end if;
 begin
 perform public.accept_current_terms(false); raise exception 'minor attestation accepted';
 exception when raise_exception then if sqlerrm not like 'Accounts are available%' then raise; end if; end;
 begin
 insert into public.account_legal_acceptances(user_id,terms_version,privacy_version,adult_attested)
 values(auth.uid(),'2026-10-09','2026-10-09',true); raise exception 'direct acceptance write allowed';
 exception when insufficient_privilege then null; end;
end $$;
select public.accept_current_terms(true);
select public.accept_current_terms(true);
do $$ begin
 if not public.can_use_app('qr-code') then raise exception 'accepted account blocked'; end if;
 if (select count(*) from public.account_legal_acceptances) <> 1 then raise exception 'acceptance not idempotent/isolated'; end if;
end $$;
insert into public.utility_configs(user_id,utility_id,config) values(auth.uid(),'qr-code','{"private":"mine"}');
insert into public.qr_codes(user_id,name,content_type) values(auth.uid(),'Private QR','text');
reset role;
update public.accounts set suspended=true where user_id='44444444-4444-4444-8444-444444444444';
insert into public.utility_configs(user_id,utility_id,config) values('55555555-5555-4555-8555-555555555555','qr-code','{"private":"other-account"}');
-- Add owned wishlist data to exercise all erasure cascades despite app restrictions.
update public.app_rules set free_access=true where app_id='wishlist';
update public.accounts set suspended=false where user_id='44444444-4444-4444-8444-444444444444';
insert into public.wishlist_collections(id,user_id,name,share_token) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','Private list','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.wishlist_items(id,collection_id,title,url) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Item','https://example.test/product');
insert into public.wishlist_reservations(item_id,cancel_token) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
update public.accounts set suspended=true where user_id='44444444-4444-4444-8444-444444444444';
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$ declare data jsonb; begin
 data=public.export_own_data();
 if data->'account'->>'email' <> 'privacy@example.test' then raise exception 'wrong account exported'; end if;
 if data->'utility_configs'->0->'config'->>'private' <> 'mine' then raise exception 'suspended data export failed'; end if;
 if data::text like '%other-account%' or data::text like '%cancel_token%' then raise exception 'export leaked other data'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','token_refresh','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 begin
 perform public.delete_own_account('DELETE'); raise exception 'token refresh bypassed password reauth';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint-3600)))::text,true);
do $$ begin
 begin
 perform public.delete_own_account('DELETE'); raise exception 'old password reauth accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 begin
 perform public.delete_own_account(''); raise exception 'missing confirmation accepted';
 exception when raise_exception then if sqlerrm not like 'Type DELETE%' then raise; end if; end;
end $$;
select public.delete_own_account('DELETE');
reset role;
do $$ begin
 if exists(select 1 from auth.users where id='44444444-4444-4444-8444-444444444444')
 or exists(select 1 from public.accounts where user_id='44444444-4444-4444-8444-444444444444')
 or exists(select 1 from public.utility_configs where user_id='44444444-4444-4444-8444-444444444444')
 or exists(select 1 from public.qr_codes where user_id='44444444-4444-4444-8444-444444444444')
 or exists(select 1 from public.account_legal_acceptances where user_id='44444444-4444-4444-8444-444444444444')
 or exists(select 1 from private.app_usage where user_id='44444444-4444-4444-8444-444444444444')
 or exists(select 1 from public.wishlist_items where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 or exists(select 1 from public.wishlist_reservations where item_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') then raise exception 'account erasure left owned data'; end if;
 if not exists(select 1 from auth.users where id='55555555-5555-4555-8555-555555555555') then raise exception 'erasure deleted another account'; end if;
end $$;
-- A master may erase its own account; the operation must not affect other users.
select set_config('request.jwt.claim.sub',(select user_id::text from public.accounts where role='master'),true);
set local role authenticated;
select public.delete_own_account('DELETE');
reset role;
do $$ begin
 if exists(select 1 from public.accounts where role='master') then raise exception 'master erasure failed'; end if;
 if not exists(select 1 from auth.users where id='55555555-5555-4555-8555-555555555555') then raise exception 'master erasure affected other users'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin perform public.export_own_data(); raise exception 'anonymous export allowed'; exception when insufficient_privilege then null; end;
 begin perform public.delete_own_account('DELETE'); raise exception 'anonymous erasure allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
