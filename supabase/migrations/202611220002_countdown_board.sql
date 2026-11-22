-- Countdowns & Time Zones: events and saved cities are stored as JSON in
-- utility_configs under utility_id 'countdown-board'. Embeds carry the board in
-- their URL, so no new table or public read path is needed. The row lets
-- utility_configs' app_access_gate accept saves from logged-in users.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('countdown-board', false, true)
on conflict (app_id) do nothing;
