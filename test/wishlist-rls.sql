-- Run against a LOCAL/test Supabase database after the Wishlist migration.
-- All fixture rows are rolled back. psql: \set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.wishlist_collections(id,name,share_token) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Birthday','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.wishlist_items(id,collection_id,title,url) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Book','https://bol.com/book');
do $$ begin
  if (select count(*) from public.wishlist_items) <> 1 then raise exception 'owner cannot read items'; end if;
  begin
    perform public.wishlist_shared('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'owner saw reservations';
  exception when raise_exception then if sqlerrm <> 'wishlist_owner' then raise; end if; end;
  begin
    perform public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'owner reserved own item';
  exception when raise_exception then if sqlerrm <> 'wishlist_owner' then raise; end if; end;
  begin
    update public.wishlist_items set price = -1;
    raise exception 'negative price accepted';
  exception when check_violation then null; end;
  begin
    update public.wishlist_items set url = 'javascript:alert(1)';
    raise exception 'unsafe URL accepted';
  exception when check_violation then null; end;
  begin
    update public.wishlist_items set tags = array[repeat('x', 31)];
    raise exception 'oversized tag accepted';
  exception when check_violation then null; end;
  begin
    update public.wishlist_items set tags = array[null::text];
    raise exception 'null tag accepted';
  exception when check_violation then null; end;
  begin
    insert into public.wishlist_items(collection_id,title,url) values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Duplicate','https://bol.com/book');
    raise exception 'duplicate URL accepted';
  exception when unique_violation then null; end;
  begin
    perform * from public.wishlist_reservations;
    raise exception 'owner can read reservation table';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ begin
  if exists(select 1 from public.wishlist_collections) or exists(select 1 from public.wishlist_items) then raise exception 'cross-account read'; end if;
  update public.wishlist_items set title = 'Hacked' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  if found then raise exception 'cross-account update'; end if;
  delete from public.wishlist_collections where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if found then raise exception 'cross-account delete'; end if;
  begin
    insert into public.wishlist_items(collection_id,title,url) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Bad','https://bol.com/bad');
    raise exception 'cross-account insert';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ declare payload jsonb; begin
  begin
    perform * from public.wishlist_collections;
    raise exception 'anonymous table access';
  exception when insufficient_privilege then null; end;
  payload := public.wishlist_shared('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  if payload->>'name' <> 'Birthday' or jsonb_array_length(payload->'items') <> 1 or payload->'items'->0->>'reserved' <> 'false' then raise exception 'wrong shared payload'; end if;
  if payload::text like '%user_id%' or payload::text like '%cancel_token%' then raise exception 'private field leak'; end if;
  if not public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'reservation failed'; end if;
  if not public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'retry not idempotent'; end if;
  if public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then raise exception 'double reservation'; end if;
  if public.wishlist_cancel('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') then raise exception 'wrong key cancelled'; end if;
  if public.wishlist_shared('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')->'items'->0->>'reserved' <> 'true' then raise exception 'reservation missing'; end if;
  if not public.wishlist_cancel('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'cancellation failed'; end if;
  perform public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
update public.wishlist_collections set share_token = null;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.wishlist_shared('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'disabled link readable';
  exception when raise_exception then if sqlerrm <> 'wishlist_unavailable' then raise; end if; end;
  begin
    perform public.wishlist_reserve('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'disabled link permits reservations';
  exception when raise_exception then if sqlerrm <> 'wishlist_unavailable' then raise; end if; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
delete from public.wishlist_collections where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
reset role;
do $$ begin
  if exists(select 1 from public.wishlist_reservations where item_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') then raise exception 'reservation not cascaded'; end if;
end $$;
rollback;
