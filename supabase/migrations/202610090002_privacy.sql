-- Apply once AFTER the accounts migration. No service-role key is required.
begin;
create table public.account_legal_acceptances (
 user_id uuid not null references auth.users(id) on delete cascade,
 terms_version text not null,
 privacy_version text not null,
 adult_attested boolean not null check (adult_attested),
 accepted_at timestamptz not null default now(),
 primary key(user_id,terms_version,privacy_version)
);
alter table public.account_legal_acceptances enable row level security;
revoke all on public.account_legal_acceptances from public,anon,authenticated;
grant select on public.account_legal_acceptances to authenticated;
create policy read_own_acceptance on public.account_legal_acceptances for select to authenticated using (user_id=auth.uid());

create function public.accept_current_terms(p_adult boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.accounts where user_id=auth.uid()) then
  raise exception 'Sign in to accept the terms' using errcode='42501';
 end if;
 if p_adult is distinct from true then raise exception 'Accounts are available to adults aged 18 and over only'; end if;
 insert into public.account_legal_acceptances(user_id,terms_version,privacy_version,adult_attested)
 values(auth.uid(),'2026-10-09','2026-10-09',true) on conflict do nothing;
end; $$;
create or replace function private.new_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.accounts(user_id) values(new.id);
 if new.raw_user_meta_data->>'terms_version'='2026-10-09'
 and new.raw_user_meta_data->>'privacy_version'='2026-10-09'
 and new.raw_user_meta_data->>'adult_attested'='true' then
  insert into public.account_legal_acceptances(user_id,terms_version,privacy_version,adult_attested)
  values(new.id,'2026-10-09','2026-10-09',true);
 end if;
 return new;
end; $$;
create or replace function public.can_use_app(p_app text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select not a.suspended and
 exists(select 1 from public.account_legal_acceptances l where l.user_id=a.user_id
 and l.terms_version='2026-10-09' and l.privacy_version='2026-10-09' and l.adult_attested) and
 (a.role='master' or coalesce(o.allowed,case when a.role='pro' then r.pro_access else r.free_access end))
 from public.accounts a join public.app_rules r on r.app_id=p_app
 left join public.account_app_rules o on o.user_id=a.user_id and o.app_id=r.app_id
 where a.user_id=auth.uid()),false);
$$;
create or replace function public.account_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('role',a.role,'suspended',a.suspended,
 'terms_accepted',exists(select 1 from public.account_legal_acceptances l where l.user_id=a.user_id
 and l.terms_version='2026-10-09' and l.privacy_version='2026-10-09' and l.adult_attested),
 'apps',coalesce((select jsonb_agg(jsonb_build_object('app_id',r.app_id,'allowed',public.can_use_app(r.app_id),
 'max_bytes',case when a.role='master' then null when o.user_id is not null then o.max_bytes when a.role='pro' then r.pro_max_bytes else r.max_bytes end,
 'used_bytes',coalesce(u.bytes,0))) from public.app_rules r
 left join public.account_app_rules o on o.app_id=r.app_id and o.user_id=a.user_id
 left join private.app_usage u on u.app_id=r.app_id and u.user_id=a.user_id),'[]'::jsonb))
 from public.accounts a where a.user_id=auth.uid();
$$;
-- Export stays available regardless of plan, app restrictions, suspension, or terms acceptance.
-- Guest cancellation tokens and other people's account data are never included.
create function public.export_own_data() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'Sign in to export your data' using errcode='42501'; end if;
 select jsonb_build_object('exported_at',now(),'account',jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at),
 'profile',(select to_jsonb(a) from public.accounts a where a.user_id=actor),
 'app_overrides',coalesce((select jsonb_agg(to_jsonb(o)) from public.account_app_rules o where o.user_id=actor),'[]'::jsonb),
 'legal_acceptances',coalesce((select jsonb_agg(to_jsonb(l)) from public.account_legal_acceptances l where l.user_id=actor),'[]'::jsonb),
 'utility_configs',coalesce((select jsonb_agg(to_jsonb(c)) from public.utility_configs c where c.user_id=actor),'[]'::jsonb),
 'qr_codes',coalesce((select jsonb_agg(to_jsonb(q)) from public.qr_codes q where q.user_id=actor),'[]'::jsonb),
 'wishlist_collections',coalesce((select jsonb_agg(to_jsonb(c)) from public.wishlist_collections c where c.user_id=actor),'[]'::jsonb),
 'wishlist_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.wishlist_items i join public.wishlist_collections c on c.id=i.collection_id where c.user_id=actor),'[]'::jsonb))
 into result from auth.users u where u.id=actor;
 if result is null then raise exception 'Account unavailable' using errcode='42501'; end if;
 return result;
end; $$;
create function public.check_account_erasure(p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid()) then
  raise exception 'Sign in to delete your account' using errcode='42501';
 end if;
 if p_confirmation is distinct from 'DELETE' then raise exception 'Type DELETE to confirm account deletion'; end if;
 -- Use the signed password-authentication time, not token iat, which changes on refresh.
 if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) m
 where m->>'method'='password' and (m->>'timestamp') ~ '^[0-9]{1,12}$'
 and (m->>'timestamp')::bigint between extract(epoch from now())::bigint-300 and extract(epoch from now())::bigint+30) then
  raise exception 'Confirm your password again before deleting your account' using errcode='42501';
 end if;
end; $$;
create function public.delete_own_account(p_confirmation text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.check_account_erasure(p_confirmation);
 -- Explicitly remove the profile before owned rows, so cascade quota triggers
 -- cannot recreate a ledger for an account being erased.
 delete from public.accounts where user_id=auth.uid();
 delete from auth.users where id=auth.uid();
end; $$;
revoke all on function public.accept_current_terms(boolean),public.export_own_data(),
 public.check_account_erasure(text),public.delete_own_account(text) from public,anon;
grant execute on function public.accept_current_terms(boolean),public.export_own_data(),
 public.check_account_erasure(text),public.delete_own_account(text) to authenticated;
commit;
