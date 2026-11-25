-- Lightroom Presets: photos are edited entirely in the browser; only the
-- presets (Lightroom develop settings, i.e. the data of .xmp files) are saved,
-- as JSON in utility_configs under utility_id 'lightroom-presets'. The row lets
-- utility_configs' app_access_gate accept saves from logged-in users.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('lightroom-presets', false, true)
on conflict (app_id) do nothing;
