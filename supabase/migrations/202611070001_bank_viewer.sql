-- Bank Viewer: read-only Enable Banking app.
-- The user's Enable Banking key is encrypted in the browser (AES-GCM, key
-- derived from the user's password) and saved as ciphertext in
-- utility_configs under utility_id 'bank-viewer'. No new table is needed.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('bank-viewer', true, false)
on conflict (app_id) do nothing;
