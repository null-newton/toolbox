-- Apply before deploying product image support. Existing items keep a null image.
begin;
alter table public.wishlist_items add column image_url text
  check (image_url is null or (length(image_url) <= 2048 and image_url ~ '^https://[^[:space:]]+$'));

create or replace function public.wishlist_shared(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.wishlist_collections;
begin
  select * into c from public.wishlist_collections where share_token = p_token;
  if not found then raise exception 'wishlist_unavailable'; end if;
  if c.user_id = auth.uid() then raise exception 'wishlist_owner'; end if;
  return jsonb_build_object('name', c.name, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'title', i.title, 'url', i.url, 'image_url', i.image_url, 'price', i.price, 'currency', i.currency,
      'availability', i.availability, 'priority', i.priority, 'tags', i.tags,
      'created_at', i.created_at, 'reserved', r.item_id is not null
    ) order by i.priority, i.created_at desc)
    from public.wishlist_items i left join public.wishlist_reservations r on r.item_id = i.id
    where i.collection_id = c.id
  ), '[]'::jsonb));
end;
$$;

commit;
