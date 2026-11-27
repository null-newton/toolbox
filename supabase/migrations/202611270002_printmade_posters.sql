-- Printmade posters: like the star map (202611270001_star_map.sql), each poster's
-- settings are stored as JSON in utility_configs under its app id, and rendering and
-- PDF export run in the browser. These rows let utility_configs' app_access_gate
-- accept their saves.
insert into public.app_rules(app_id, uses_backend, free_access) values
('moon-calendar', false, true),
('solar-system', false, true),
('daylight', false, true),
('sky-event', false, true),
('city-map', false, true),
('topo-map', false, true),
('route', false, true),
('sound-wave', false, true),
('name-pattern', false, true),
('life-calendar', false, true),
('family-tree', false, true),
('coordinates', false, true),
('element-name', false, true)
on conflict (app_id) do nothing;
