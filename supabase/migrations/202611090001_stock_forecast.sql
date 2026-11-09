-- Stock Forecast replaces Stock Tracker: inherit its rule and per-account overrides.
insert into public.app_rules(app_id, uses_backend, free_access, max_bytes, pro_access, pro_max_bytes)
select 'stock-forecast', true, free_access, max_bytes, pro_access, pro_max_bytes from public.app_rules where app_id = 'stock-tracker'
union all select 'stock-forecast', true, false, 1048576, true, null where not exists (select 1 from public.app_rules where app_id = 'stock-tracker')
on conflict (app_id) do nothing;
insert into public.account_app_rules(user_id, app_id, allowed, max_bytes)
select user_id, 'stock-forecast', allowed, max_bytes from public.account_app_rules where app_id = 'stock-tracker'
on conflict (user_id, app_id) do nothing;
