-- Developer tools pack: JSON formatter/diff, Base64, JWT decoder, regex
-- tester, cron explainer and colour converter (plus the revived Text Case
-- Converter, which already has a row). Everything runs in the browser, so no
-- backend and free access. The rows let utility_configs' app_access_gate
-- accept saved preferences (e.g. JSON indent) from logged-in users.
insert into public.app_rules(app_id, uses_backend, free_access)
values
  ('json-tools', false, true),
  ('base64', false, true),
  ('jwt-decoder', false, true),
  ('regex-tester', false, true),
  ('cron-explainer', false, true),
  ('colour-converter', false, true),
  ('text-case', false, true)
on conflict (app_id) do nothing;
