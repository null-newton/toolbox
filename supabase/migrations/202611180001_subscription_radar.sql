-- Subscription Radar: finds recurring charges in Bank Viewer's cached transactions, entirely in the browser.
-- Known/ignored marks are sealed with the Bank Viewer data key and stored in utility_configs under
-- utility_id 'subscription-radar'. No backend route and no new table.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('subscription-radar', false, false)
on conflict (app_id) do nothing;
