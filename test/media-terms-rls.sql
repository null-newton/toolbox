-- Local/test database only; run after all migrations. Fixtures roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('66666666-6666-4666-8666-666666666666','old-client@example.test','{"terms_version":"2026-10-09","privacy_version":"2026-10-09","adult_attested":true}'),
 ('77777777-7777-4777-8777-777777777777','new-client@example.test','{"terms_version":"2026-10-09.2","privacy_version":"2026-10-09","adult_attested":true}');
insert into public.account_legal_acceptances(user_id,terms_version,privacy_version,adult_attested)
 values('66666666-6666-4666-8666-666666666666','2026-10-09','2026-10-09',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin
 if public.can_use_app('qr-code') or (public.account_access()->>'terms_accepted')::boolean then
  raise exception 'historical acceptance counted as acceptance of revised terms';
 end if;
 begin
  perform public.accept_current_terms(true); raise exception 'cached frontend silently accepted unseen terms';
 exception when raise_exception then if sqlerrm not like 'Terms changed.%' then raise; end if; end;
 begin
  perform public.accept_current_terms(true,'2026-10-09','2026-10-09'); raise exception 'stale explicit version accepted';
 exception when raise_exception then if sqlerrm not like 'Terms changed.%' then raise; end if; end;
 if public.export_own_data()->'account'->>'email' <> 'old-client@example.test' then raise exception 'unaccepted user cannot export'; end if;
end $$;
select public.accept_current_terms(true,'2026-10-09.2','2026-10-09');
do $$ begin
 if not public.can_use_app('qr-code') then raise exception 'new acceptance did not unlock app'; end if;
 if (select count(*) from public.account_legal_acceptances) <> 2 then raise exception 'historical receipt was overwritten'; end if;
end $$;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
do $$ begin
 if not public.can_use_app('qr-code') then raise exception 'current signup metadata did not create receipt'; end if;
 if (select terms_version from public.account_legal_acceptances) <> '2026-10-09.2' then raise exception 'wrong terms revision recorded'; end if;
end $$;
rollback;
