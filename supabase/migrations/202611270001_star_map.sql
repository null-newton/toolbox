-- Star Map: poster settings are stored as JSON in utility_configs under
-- utility_id 'star-map'. Rendering and PDF export run in the browser, so no
-- new table is needed. The row lets utility_configs' app_access_gate accept saves.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('star-map', false, true)
on conflict (app_id) do nothing;
