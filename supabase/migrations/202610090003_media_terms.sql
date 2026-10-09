-- Apply once AFTER 202610090002_privacy.sql, then deploy the updated frontend.
-- Preserve historical receipts and require explicit review of revised Terms.
begin;
-- A cached frontend must not silently accept a version it has not displayed.
create or replace function public.accept_current_terms(p_adult boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Terms changed. Refresh and review the current documents before agreeing.';
end; $$;
create function public.accept_current_terms(p_adult boolean,p_terms_version text,p_privacy_version text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.accounts where user_id=auth.uid()) then
  raise exception 'Sign in to accept the terms' using errcode='42501';
 end if;
 if p_terms_version is distinct from '2026-10-09.2' or p_privacy_version is distinct from '2026-10-09' then
  raise exception 'Terms changed. Refresh and review the current documents before agreeing.';
 end if;
 if p_adult is distinct from true then raise exception 'Accounts are available to adults aged 18 and over only'; end if;
 insert into public.account_legal_acceptances(user_id,terms_version,privacy_version,adult_attested)
 values(auth.uid(),'2026-10-09.2','2026-10-09',true) on conflict do nothing;
end; $$;
create or replace function private.new_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.accounts(user_id) values(new.id);
 if new.raw_user_meta_data->>'terms_version'='2026-10-09.2'
 and new.raw_user_meta_data->>'privacy_version'='2026-10-09'
 and new.raw_user_meta_data->>'adult_attested'='true' then
  insert into public.account_legal_acceptances(user_id,terms_version,privacy_version,adult_attested)
  values(new.id,'2026-10-09.2','2026-10-09',true);
 end if;
 return new;
end; $$;
create or replace function public.can_use_app(p_app text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select not a.suspended and
 exists(select 1 from public.account_legal_acceptances l where l.user_id=a.user_id
 and l.terms_version='2026-10-09.2' and l.privacy_version='2026-10-09' and l.adult_attested) and
 (a.role='master' or coalesce(o.allowed,case when a.role='pro' then r.pro_access else r.free_access end))
 from public.accounts a join public.app_rules r on r.app_id=p_app
 left join public.account_app_rules o on o.user_id=a.user_id and o.app_id=r.app_id
 where a.user_id=auth.uid()),false);
$$;
create or replace function public.account_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('role',a.role,'suspended',a.suspended,
 'terms_accepted',exists(select 1 from public.account_legal_acceptances l where l.user_id=a.user_id
 and l.terms_version='2026-10-09.2' and l.privacy_version='2026-10-09' and l.adult_attested),
 'apps',coalesce((select jsonb_agg(jsonb_build_object('app_id',r.app_id,'allowed',public.can_use_app(r.app_id),
 'max_bytes',case when a.role='master' then null when o.user_id is not null then o.max_bytes when a.role='pro' then r.pro_max_bytes else r.max_bytes end,
 'used_bytes',coalesce(u.bytes,0))) from public.app_rules r
 left join public.account_app_rules o on o.app_id=r.app_id and o.user_id=a.user_id
 left join private.app_usage u on u.app_id=r.app_id and u.user_id=a.user_id),'[]'::jsonb))
 from public.accounts a where a.user_id=auth.uid();
$$;

revoke all on function public.accept_current_terms(boolean,text,text) from public,anon;
grant execute on function public.accept_current_terms(boolean,text,text) to authenticated;
commit;
