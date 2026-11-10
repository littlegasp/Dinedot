-- 0002 · Restaurant cover photo shown at the top of the guest page.
-- Run after 0001_init.sql (SQL Editor → paste → Run). Safe to run twice.
alter table public.settings add column if not exists cover_url text not null default '';

-- guest_menu: add place.cover
create or replace function public.guest_menu(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables; s public.settings;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where id = 1;
  return jsonb_build_object(
    'table', jsonb_build_object('code', t.code, 'name', coalesce(nullif(t.name, ''), 'Table ' || t.code)),
    'place', jsonb_build_object('name', s.restaurant_name, 'tagline', s.tagline, 'currency', s.currency, 'accent', s.accent,
       'cover', s.cover_url,
       'accepting', s.accepting_orders, 'closed_message', s.closed_message, 'welcome', s.welcome_note,
       'gst_pct', s.gst_pct, 'service_pct', s.service_pct, 'tips', to_jsonb(s.tip_options),
       'pay', jsonb_build_object('upi', s.pay_upi and s.upi_id <> '', 'cash', s.pay_cash, 'card', s.pay_card),
       'has_wifi', s.wifi_name <> '', 'review_url', s.google_review_url),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name)
                              from public.categories c where c.active and exists (select 1 from public.items i where i.category_id = c.id)), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'cat', i.category_id, 'name', i.name, 'desc', i.description,
                          'price', i.price, 'diet', i.diet, 'spice', i.spice, 'allergens', to_jsonb(i.allergens), 'sizes', i.sizes,
                          'addons', i.addons, 'photo', i.photo_url, 'best', i.bestseller, 'available', i.available) order by i.sort, i.name)
                         from public.items i join public.categories c on c.id = i.category_id where c.active), '[]'));
end $$;

-- owner_save_settings: also saves cover_url (owner only, like the other settings)
create or replace function public.owner_save_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  if not public.is_owner() and exists (select 1 from jsonb_object_keys(p) k where k <> 'accepting_orders') then
    raise exception 'Only the owner can change settings.' using errcode = '42501';
  end if;
  if coalesce(p ->> 'cover_url', '') <> '' and (p ->> 'cover_url') !~ '^(https://|img/)' then
    raise exception 'The cover photo must be an uploaded photo.';
  end if;
  update public.settings set
    restaurant_name   = coalesce(nullif(trim(p ->> 'restaurant_name'), ''), restaurant_name),
    tagline           = coalesce(p ->> 'tagline', tagline),
    currency          = coalesce(nullif(p ->> 'currency', ''), currency),
    accent            = coalesce(nullif(p ->> 'accent', ''), accent),
    cover_url         = coalesce(p ->> 'cover_url', cover_url),
    accepting_orders  = coalesce((p ->> 'accepting_orders')::boolean, accepting_orders),
    closed_message    = coalesce(nullif(p ->> 'closed_message', ''), closed_message),
    wifi_name         = coalesce(p ->> 'wifi_name', wifi_name),
    wifi_password     = coalesce(p ->> 'wifi_password', wifi_password),
    upi_id            = coalesce(trim(p ->> 'upi_id'), upi_id),
    upi_name          = coalesce(p ->> 'upi_name', upi_name),
    gst_pct           = coalesce((p ->> 'gst_pct')::numeric, gst_pct),
    service_pct       = coalesce((p ->> 'service_pct')::numeric, service_pct),
    tip_options       = coalesce(array(select jsonb_array_elements_text(p -> 'tip_options')::int), tip_options),
    pay_cash          = coalesce((p ->> 'pay_cash')::boolean, pay_cash),
    pay_card          = coalesce((p ->> 'pay_card')::boolean, pay_card),
    pay_upi           = coalesce((p ->> 'pay_upi')::boolean, pay_upi),
    google_review_url = coalesce(p ->> 'google_review_url', google_review_url),
    welcome_note      = coalesce(p ->> 'welcome_note', welcome_note),
    updated_at        = now()
   where id = 1;
  if p ? 'accepting_orders' then perform public.log_it(case when (p ->> 'accepting_orders')::boolean then 'orders_on' else 'orders_off' end, ''); end if;
  if p ? 'restaurant_name' or p ? 'upi_id' or p ? 'gst_pct' or p ? 'cover_url' then perform public.log_it('settings_changed', ''); end if;
end $$;
