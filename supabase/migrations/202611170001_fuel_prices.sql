-- Fuel Prices: official Belgian maximum prices for Euro 95, Super 98 and
-- diesel (FOD Economie, via be.STAT), served from the self-hosted backend's
-- daily snapshot (route fuel-prices). Public data with no upstream cost, so it
-- is open to free accounts too. No per-user data is stored.
insert into public.app_rules(app_id, uses_backend, free_access)
values ('fuel-prices', true, true)
on conflict (app_id) do nothing;
