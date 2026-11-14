-- Route Planner: walking/running/cycling/motorcycle/car routes via the public
-- Valhalla + Nominatim services (no backend). Saved routes and preferences are
-- stored as JSON in utility_configs under utility_id 'route-planner'.
-- The tool works without an account, so it is open to free accounts too; the
-- row is needed so utility_configs' app_access_gate lets logged-in users save.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('route-planner', false, true)
on conflict (app_id) do nothing;
