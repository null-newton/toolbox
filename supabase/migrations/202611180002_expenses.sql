-- Expenses: monthly spending per category from Bank Viewer's cached transactions, entirely in the browser.
-- Category overrides are sealed with the Bank Viewer data key and stored in utility_configs under
-- utility_id 'expenses'. No backend route and no new table.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('expenses', false, false)
on conflict (app_id) do nothing;
