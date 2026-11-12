-- Strip Library: comic album lookup on stripinfo.be via the self-hosted
-- backend (route strip-library). The user's collection is stored as JSON in
-- utility_configs under utility_id 'strip-library'; no new table is needed.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('strip-library', true, false)
on conflict (app_id) do nothing;
