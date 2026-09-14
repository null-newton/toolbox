-- Apply once in the Supabase SQL editor before deploying Wishlist.
begin;
create table public.wishlist_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  share_token uuid unique,
  created_at timestamptz not null default now()
);
create index on public.wishlist_collections(user_id, created_at);
create function public.wishlist_valid_tags(value text[]) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(value) <= 20 and not exists (
    select 1 from unnest(value) tag where tag is null or length(trim(tag)) not between 1 and 30 or tag like '%,%'
  );
$$;
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.wishlist_collections(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 300),
  url text not null check (length(url) <= 2048 and url ~ '^https://[^[:space:]]+$'),
  price numeric(12,2) check (price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  availability text not null default 'unknown' check (availability in ('unknown','in_stock','out_of_stock','preorder')),
  priority integer not null default 2 check (priority between 1 and 3),
  tags text[] not null default '{}' check (public.wishlist_valid_tags(tags) and length(array_to_string(tags, ',')) <= 600),
  created_at timestamptz not null default now(),
  unique(collection_id, url)
);
-- No owner or guest table access: only the narrowly scoped RPCs below.
create table public.wishlist_reservations (
  item_id uuid primary key references public.wishlist_items(id) on delete cascade,
  cancel_token uuid not null,
  created_at timestamptz not null default now()
);
alter table public.wishlist_collections enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.wishlist_reservations enable row level security;
revoke all on public.wishlist_collections, public.wishlist_items, public.wishlist_reservations from anon, authenticated;
grant select, insert, update, delete on public.wishlist_collections, public.wishlist_items to authenticated;
create policy wishlist_collection_owner on public.wishlist_collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wishlist_item_owner on public.wishlist_items for all to authenticated
  using (exists (select 1 from public.wishlist_collections c where c.id = collection_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.wishlist_collections c where c.id = collection_id and c.user_id = (select auth.uid())));

create function public.wishlist_shared(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.wishlist_collections;
begin
  select * into c from public.wishlist_collections where share_token = p_token;
  if not found then raise exception 'wishlist_unavailable'; end if;
  if c.user_id = auth.uid() then raise exception 'wishlist_owner'; end if;
  return jsonb_build_object('name', c.name, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'title', i.title, 'url', i.url, 'price', i.price, 'currency', i.currency,
      'availability', i.availability, 'priority', i.priority, 'tags', i.tags,
      'created_at', i.created_at, 'reserved', r.item_id is not null
    ) order by i.priority, i.created_at desc)
    from public.wishlist_items i left join public.wishlist_reservations r on r.item_id = i.id
    where i.collection_id = c.id
  ), '[]'::jsonb));
end;
$$;

-- The caller creates and retains a random cancellation capability BEFORE the
-- request, so a lost response can be retried without losing the reservation.
create function public.wishlist_reserve(p_token uuid, p_item uuid, p_cancel uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; existing uuid;
begin
  if p_cancel is null then raise exception 'wishlist_invalid'; end if;
  -- Lock collection first; disabling/rotating a link waits for this transaction.
  select c.user_id into owner_id from public.wishlist_collections c
    where c.share_token = p_token for share;
  if not found then raise exception 'wishlist_unavailable'; end if;
  if owner_id = auth.uid() then raise exception 'wishlist_owner'; end if;
  perform 1 from public.wishlist_items i join public.wishlist_collections c on c.id = i.collection_id
    where i.id = p_item and c.share_token = p_token for update of i;
  if not found then raise exception 'wishlist_unavailable'; end if;
  select cancel_token into existing from public.wishlist_reservations where item_id = p_item;
  if found then return existing = p_cancel; end if;
  insert into public.wishlist_reservations(item_id, cancel_token) values(p_item, p_cancel);
  return true;
end;
$$;

create function public.wishlist_cancel(p_token uuid, p_item uuid, p_cancel uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  select c.user_id into owner_id from public.wishlist_collections c where c.share_token = p_token for share;
  if not found then raise exception 'wishlist_unavailable'; end if;
  if owner_id = auth.uid() then raise exception 'wishlist_owner'; end if;
  perform 1 from public.wishlist_items i join public.wishlist_collections c on c.id = i.collection_id
    where i.id = p_item and c.share_token = p_token for update of i;
  if not found then raise exception 'wishlist_unavailable'; end if;
  delete from public.wishlist_reservations where item_id = p_item and cancel_token = p_cancel;
  return found;
end;
$$;
revoke all on function public.wishlist_shared(uuid), public.wishlist_reserve(uuid,uuid,uuid), public.wishlist_cancel(uuid,uuid,uuid) from public;
grant execute on function public.wishlist_shared(uuid), public.wishlist_reserve(uuid,uuid,uuid), public.wishlist_cancel(uuid,uuid,uuid) to anon, authenticated;
commit;
