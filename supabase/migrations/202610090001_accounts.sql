-- Apply after schema.sql and the Wishlist migrations, BEFORE enabling signup.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'free' check (role in ('free','pro','master')),
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index accounts_single_master on public.accounts(role) where role = 'master';
insert into public.accounts(user_id) select id from auth.users;
-- Bootstrap only the owner's EXISTING account, never signup metadata or first-user wins.
do $$ begin
 update public.accounts a set role='master' from auth.users u
 where a.user_id=u.id and lower(u.email)='isaacsauer@icloud.com';
 if not found then raise exception 'Existing master account isaacsauer@icloud.com was not found. Verify the Supabase project before continuing.'; end if;
end $$;
create table public.app_rules (
  app_id text primary key,
  uses_backend boolean not null,
  free_access boolean not null default false,
  max_bytes bigint default 1048576 check (max_bytes between 0 and 1099511627776),
  pro_access boolean not null default true,
  pro_max_bytes bigint default null check (pro_max_bytes between 0 and 1099511627776)
);
insert into public.app_rules(app_id, uses_backend, free_access) values
('song-listener', true, false),
('weather', true, false),
('image-toolbox', false, true),
('background-remover', false, true),
('image-upscaler', true, false),
('file-transfer', true, false),
('route-optimizer', true, false),
('solar-roof', true, false),
('yt-dlp', true, false),
('subtitle-studio', true, false),
('qr-code', false, true),
('work-hours', false, true),
('meal-planner', false, true),
('meme-studio', false, true),
('video-editor', false, true),
('board-game-scores', false, true),
('wishlist', true, false),
('text-case', false, true),
('soccer-predictor', true, false),
('stock-tracker', true, false),
('movies', true, false),
('__favorites__', false, true);
create table public.account_app_rules (
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  app_id text not null references public.app_rules(app_id),
  allowed boolean not null,
  max_bytes bigint check (max_bytes between 0 and 1099511627776),
  primary key(user_id, app_id)
);
create table private.app_usage (
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  app_id text not null,
  bytes bigint not null default 0 check (bytes >= 0),
  primary key(user_id, app_id)
);
-- Only the trusted SECURITY DEFINER functions may access the quota ledger.
-- No client policies: RLS denies direct access even if table grants change.
alter table private.app_usage enable row level security;
revoke all on private.app_usage from public, anon, authenticated;
create function private.new_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accounts(user_id) values(new.id);
  return new;
end; $$;
create trigger toolbox_new_account after insert on auth.users for each row execute function private.new_account();

create function public.can_use_app(p_app text) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((select not a.suspended and
   (a.role='master' or coalesce(o.allowed,case when a.role='pro' then r.pro_access else r.free_access end))
   from public.accounts a join public.app_rules r on r.app_id = p_app
   left join public.account_app_rules o on o.user_id = a.user_id and o.app_id = r.app_id
   where a.user_id = auth.uid()), false);
$$;
create function private.require_master() returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.accounts where user_id = auth.uid() and role = 'master' and not suspended)
 then raise exception 'Master account required' using errcode = '42501'; end if;
end; $$;

-- No browser can directly modify roles, grants, quotas, or usage.
alter table public.accounts enable row level security;
alter table public.app_rules enable row level security;
alter table public.account_app_rules enable row level security;
revoke all on public.accounts, public.app_rules, public.account_app_rules from anon, authenticated;
grant select on public.accounts, public.app_rules, public.account_app_rules to authenticated;
create policy own_account on public.accounts for select to authenticated using (user_id = auth.uid());
create policy read_app_rules on public.app_rules for select to authenticated using (true);
create policy own_app_rules on public.account_app_rules for select to authenticated using (user_id = auth.uid());

create function public.account_access() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('role',a.role,'suspended',a.suspended,'apps',coalesce((
 select jsonb_agg(jsonb_build_object('app_id',r.app_id,'allowed',public.can_use_app(r.app_id),
 'max_bytes',case when a.role='master' then null when o.user_id is not null then o.max_bytes when a.role='pro' then r.pro_max_bytes else r.max_bytes end,
 'used_bytes',coalesce(u.bytes,0))) from public.app_rules r
 left join public.account_app_rules o on o.app_id=r.app_id and o.user_id=a.user_id
 left join private.app_usage u on u.app_id=r.app_id and u.user_id=a.user_id),'[]'::jsonb))
 from public.accounts a where a.user_id=auth.uid();
$$;
create function public.admin_accounts() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_master();
 return jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object(
 'user_id',a.user_id,'email',u.email,'role',a.role,'suspended',a.suspended,'created_at',a.created_at)
 order by a.created_at desc) from public.accounts a join auth.users u on u.id=a.user_id),'[]'::jsonb),
 'apps',coalesce((select jsonb_agg(to_jsonb(r) order by app_id) from public.app_rules r),'[]'::jsonb),
 'overrides',coalesce((select jsonb_agg(to_jsonb(o)) from public.account_app_rules o),'[]'::jsonb),
 'usage',coalesce((select jsonb_agg(to_jsonb(u)) from private.app_usage u),'[]'::jsonb));
end; $$;
create function public.admin_set_account(p_user uuid,p_role text,p_suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_master();
 if p_role not in ('free','pro') or p_role is null or p_suspended is null then raise exception 'Invalid account settings'; end if;
 update public.accounts set role=p_role,suspended=p_suspended where user_id=p_user and role <> 'master';
 if not found then raise exception 'Account unavailable; the master account cannot be changed'; end if;
end; $$;
create function public.admin_set_app(p_app text,p_allowed boolean,p_max_bytes bigint,p_role text default 'free') returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_master();
 if p_role='free' then
  update public.app_rules set free_access=p_allowed,max_bytes=p_max_bytes where app_id=p_app;
 elsif p_role='pro' then
  update public.app_rules set pro_access=p_allowed,pro_max_bytes=p_max_bytes where app_id=p_app;
 else raise exception 'Invalid account type'; end if;
 if not found then raise exception 'Unknown app'; end if;
end; $$;
create function public.admin_set_account_app(p_user uuid,p_app text,p_allowed boolean,p_max_bytes bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_master();
 if p_allowed is null then
   delete from public.account_app_rules where user_id=p_user and app_id=p_app;
 else
   insert into public.account_app_rules(user_id,app_id,allowed,max_bytes) values(p_user,p_app,p_allowed,p_max_bytes)
   on conflict(user_id,app_id) do update set allowed=excluded.allowed,max_bytes=excluded.max_bytes;
 end if;
end; $$;

-- Track the UTF-8 JSON size of saved rows. Atomic increments serialize concurrent
-- saves for the same user/app; exceptions roll back both the row and its charge.
create function private.charge_app(p_user uuid,p_app text,p_delta bigint,p_check_access boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare account public.accounts; cap bigint; permitted boolean; used bigint; known_app boolean;
begin
 select * into account from public.accounts where user_id=p_user;
 select case when o.user_id is not null then o.max_bytes when account.role='pro' then r.pro_max_bytes else r.max_bytes end,
 coalesce(o.allowed,case when account.role='pro' then r.pro_access else r.free_access end),true into cap,permitted,known_app
 from public.app_rules r left join public.account_app_rules o on o.app_id=r.app_id and o.user_id=p_user
 where r.app_id=p_app;
 if p_check_access and (account.user_id is null or account.suspended or known_app is distinct from true or
   (account.role <> 'master' and not permitted)) then
   raise exception 'Access to this app is disabled' using errcode='42501';
 end if;
 insert into private.app_usage(user_id,app_id,bytes) values(p_user,p_app,greatest(0,p_delta))
 on conflict(user_id,app_id) do update set bytes=greatest(0,private.app_usage.bytes+p_delta)
 returning bytes into used;
 if p_delta > 0 and account.role <> 'master' and cap is not null and used > cap then
   raise exception 'Saved-data limit reached for %. Delete saved data or contact the administrator.',p_app using errcode='23514';
 end if;
end; $$;
create function private.saved_data_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; owner_id uuid; app text; delta bigint; c_id uuid;
begin
 if TG_OP <> 'INSERT' then before_row=to_jsonb(old); end if;
 if TG_OP <> 'DELETE' then after_row=to_jsonb(new); end if;
 if TG_OP='UPDATE' and (before_row->>'user_id' is distinct from after_row->>'user_id'
   or before_row->>'utility_id' is distinct from after_row->>'utility_id'
   or before_row->>'collection_id' is distinct from after_row->>'collection_id'
   or before_row->>'item_id' is distinct from after_row->>'item_id') then
   raise exception 'Saved-data ownership cannot be changed' using errcode='42501';
 end if;
 if TG_TABLE_NAME='utility_configs' then
   owner_id=(coalesce(after_row,before_row)->>'user_id')::uuid;
   app=coalesce(after_row,before_row)->>'utility_id';
 elsif TG_TABLE_NAME='qr_codes' then
   owner_id=(coalesce(after_row,before_row)->>'user_id')::uuid; app='qr-code';
 elsif TG_TABLE_NAME='wishlist_collections' then
   owner_id=(coalesce(after_row,before_row)->>'user_id')::uuid; app='wishlist';
 elsif TG_TABLE_NAME='wishlist_items' then
   c_id=(coalesce(after_row,before_row)->>'collection_id')::uuid;
   select user_id into owner_id from public.wishlist_collections where id=c_id; app='wishlist';
 else
   select c.user_id into owner_id from public.wishlist_items i join public.wishlist_collections c on c.id=i.collection_id
   where i.id=(coalesce(after_row,before_row)->>'item_id')::uuid; app='wishlist';
 end if;
 -- Cascades may already have removed the parent; its AFTER DELETE trigger charges
 -- the entire subtree instead. Account deletion also cascades the usage ledger.
 if owner_id is null or not exists(select 1 from public.accounts where user_id=owner_id) then return null; end if;
 delta=coalesce(octet_length(after_row::text),0)-coalesce(octet_length(before_row::text),0);
 perform private.charge_app(owner_id,app,delta,TG_OP <> 'DELETE');
 return null;
end; $$;
-- Cascading deletion needs an explicit subtree debit before the parent disappears.
create function private.wishlist_delete_charge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; amount bigint;
begin
 if TG_TABLE_NAME='wishlist_collections' then
   owner_id=old.user_id;
   select coalesce(sum(octet_length(to_jsonb(i)::text)),0) into amount from public.wishlist_items i where collection_id=old.id;
   select amount+coalesce(sum(octet_length(to_jsonb(r)::text)),0) into amount from public.wishlist_reservations r
   join public.wishlist_items i on i.id=r.item_id where i.collection_id=old.id;
 else
   select user_id into owner_id from public.wishlist_collections where id=old.collection_id;
   select coalesce(sum(octet_length(to_jsonb(r)::text)),0) into amount from public.wishlist_reservations r where item_id=old.id;
 end if;
 if owner_id is not null and exists(select 1 from public.accounts where user_id=owner_id) then
   perform private.charge_app(owner_id,'wishlist',-amount,false);
 end if;
 return old;
end; $$;
create trigger wishlist_collection_delete_charge before delete on public.wishlist_collections
 for each row execute function private.wishlist_delete_charge();
create trigger wishlist_item_delete_charge before delete on public.wishlist_items
 for each row execute function private.wishlist_delete_charge();
create policy app_access_gate on public.utility_configs as restrictive for all to authenticated
 using (public.can_use_app(utility_id)) with check (public.can_use_app(utility_id));
create policy app_access_gate on public.qr_codes as restrictive for all to authenticated
 using (public.can_use_app('qr-code')) with check (public.can_use_app('qr-code'));
create policy app_access_gate on public.wishlist_collections as restrictive for all to authenticated
 using (public.can_use_app('wishlist')) with check (public.can_use_app('wishlist'));
create policy app_access_gate on public.wishlist_items as restrictive for all to authenticated
 using (public.can_use_app('wishlist')) with check (public.can_use_app('wishlist'));
create trigger saved_data_charge after insert or update or delete on public.utility_configs for each row execute function private.saved_data_change();
create trigger saved_data_charge after insert or update or delete on public.qr_codes for each row execute function private.saved_data_change();
create trigger saved_data_charge after insert or update or delete on public.wishlist_collections for each row execute function private.saved_data_change();
create trigger saved_data_charge after insert or update or delete on public.wishlist_items for each row execute function private.saved_data_change();
create trigger saved_data_charge after insert or update or delete on public.wishlist_reservations for each row execute function private.saved_data_change();
-- Backfill existing usage without deleting or truncating any data.
insert into private.app_usage(user_id,app_id,bytes)
select user_id,app_id,sum(bytes) from (
 select user_id,utility_id app_id,octet_length(to_jsonb(c)::text) bytes from public.utility_configs c
 union all select user_id,'qr-code',octet_length(to_jsonb(q)::text) from public.qr_codes q
 union all select user_id,'wishlist',octet_length(to_jsonb(c)::text) from public.wishlist_collections c
 union all select c.user_id,'wishlist',octet_length(to_jsonb(i)::text) from public.wishlist_items i join public.wishlist_collections c on c.id=i.collection_id
 union all select c.user_id,'wishlist',octet_length(to_jsonb(r)::text) from public.wishlist_reservations r join public.wishlist_items i on i.id=r.item_id join public.wishlist_collections c on c.id=i.collection_id
) rows group by user_id,app_id;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.can_use_app(text),public.account_access(),public.admin_accounts(),
 public.admin_set_account(uuid,text,boolean),public.admin_set_app(text,boolean,bigint,text),
 public.admin_set_account_app(uuid,text,boolean,bigint) from public,anon;
grant execute on function public.can_use_app(text),public.account_access(),public.admin_accounts(),
 public.admin_set_account(uuid,text,boolean),public.admin_set_app(text,boolean,bigint,text),
 public.admin_set_account_app(uuid,text,boolean,bigint) to authenticated;
commit;
