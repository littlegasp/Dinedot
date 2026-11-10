-- =============================================================================
-- 0004 · Many restaurants in one system (DineOS Phase 3). Run after 0001–0003.
--
-- What changes
-- * New tables: restaurants, memberships (who works where, with which role).
-- * Every data table gets restaurant_id. Existing data moves into one restaurant made from
--   the current settings, so a one-restaurant install keeps working exactly as before.
-- * Every function now works inside the signed-in person's current restaurant. Guests are
--   placed by their table's QR token, as before. Function names and inputs are unchanged.
-- * A trigger fills restaurant_id from the parent row and refuses any link across
--   restaurants (a dish in another restaurant's section, an order on another's table...).
-- * Order numbers count per restaurant.
-- * Nothing is deleted. Old columns staff.role / staff.active stay but are no longer used.
--
-- Signing up
-- * Fresh install: the first login becomes owner of the one restaurant (as before).
-- * One restaurant and later logins: they start switched off in it (as before).
-- * Logins added from the Team screen join the owner's restaurant (set by team-admin).
-- * Anyone else signs in with no restaurant and can create one (create_restaurant).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Restaurants and memberships
-- -----------------------------------------------------------------------------
create table public.restaurants (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name           text not null check (length(trim(name)) between 1 and 80),
  status         text not null default 'active' check (status in ('active', 'suspended')),
  last_order_no  int  not null default 0,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create table public.memberships (
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           text not null default 'waiter' check (role in ('owner', 'manager', 'waiter', 'kitchen')),
  active         boolean not null default false,
  name           text not null default '',
  phone          text not null default '',
  created_at     timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

alter table public.staff add column if not exists current_restaurant uuid references public.restaurants (id) on delete set null;
comment on column public.staff.role is 'Not used since 0004: see memberships.role';
comment on column public.staff.active is 'Not used since 0004: see memberships.active';

alter table public.restaurants enable row level security;
alter table public.memberships enable row level security;
revoke all on public.restaurants, public.memberships from anon, authenticated;

-- The existing restaurant (from the one settings row) and its people
insert into public.restaurants (slug, name, created_at)
select 'main', coalesce(nullif(trim(restaurant_name), ''), 'Your Restaurant'), now() from public.settings where id = 1;

insert into public.memberships (restaurant_id, user_id, role, active, name, phone, created_at)
select (select id from public.restaurants where slug = 'main'), s.id, s.role, s.active, s.name, s.phone, s.created_at
  from public.staff s;

-- -----------------------------------------------------------------------------
-- restaurant_id on every data table, filled with the existing restaurant
-- -----------------------------------------------------------------------------
do $$
declare t text; main uuid := (select id from public.restaurants where slug = 'main');
begin
  foreach t in array array['settings','categories','items','dining_tables','visits','orders','order_items',
                           'calls','reviews','payments','activity_log'] loop
    execute format('alter table public.%I add column restaurant_id uuid references public.restaurants (id) on delete cascade', t);
    execute format('update public.%I set restaurant_id = %L', t, main);
    execute format('alter table public.%I alter column restaurant_id set not null', t);
    execute format('create index %I on public.%I (restaurant_id)', t || '_restaurant_idx', t);
  end loop;
end $$;

update public.restaurants set last_order_no = coalesce((select max(no) from public.orders), 0) where slug = 'main';

-- Settings: one row per restaurant instead of one row in total
alter table public.settings drop constraint if exists settings_id_check;
create sequence if not exists public.settings_id_seq owned by public.settings.id;
select setval('public.settings_id_seq', greatest((select max(id) from public.settings), 1));
alter table public.settings alter column id set default nextval('public.settings_id_seq');
alter table public.settings add constraint settings_restaurant_key unique (restaurant_id);
revoke all on sequence public.settings_id_seq from anon, authenticated;

-- Table numbers are unique inside a restaurant (QR tokens stay unique everywhere)
alter table public.dining_tables drop constraint if exists dining_tables_code_key;
alter table public.dining_tables add constraint dining_tables_restaurant_code_key unique (restaurant_id, code);

-- Deleting a restaurant removes all its rows in one go. RESTRICT would stop that half way,
-- so the dish → section link is checked at the end of the statement instead (same rule).
alter table public.items drop constraint if exists items_category_id_fkey;
alter table public.items add constraint items_category_id_fkey foreign key (category_id) references public.categories (id) on delete no action;

-- -----------------------------------------------------------------------------
-- Who is where
-- -----------------------------------------------------------------------------
-- The restaurant the signed-in person is working in: the one they last picked, otherwise
-- their oldest active one. Suspended restaurants never count.
create or replace function public.my_restaurant() returns uuid
language sql stable security definer set search_path = public as $$
  select m.restaurant_id
    from public.memberships m join public.restaurants r on r.id = m.restaurant_id
   where m.user_id = auth.uid() and m.active and r.status = 'active'
   order by (m.restaurant_id is not distinct from (select current_restaurant from public.staff where id = auth.uid())) desc, m.created_at
   limit 1;
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.memberships where user_id = auth.uid() and restaurant_id = public.my_restaurant() and active;
$$;

-- For rows made outside a signed-in session (sample menu, SQL editor): only allowed when the
-- system has exactly one restaurant, so nothing can land in the wrong one.
create or replace function public.only_restaurant() returns uuid
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(id::text)::uuid end from public.restaurants;
$$;

-- Fills restaurant_id from the parent row and refuses links across restaurants.
create or replace function public.set_restaurant_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if tg_op = 'UPDATE' and new.restaurant_id is distinct from old.restaurant_id then
    raise exception 'Rows can''t move between restaurants.';
  end if;
  case tg_table_name
    when 'items'                         then select restaurant_id into p from public.categories where id = new.category_id;
    when 'visits', 'calls'               then select restaurant_id into p from public.dining_tables where id = new.table_id;
    when 'orders'                        then select restaurant_id into p from public.visits where id = new.visit_id;
    when 'order_items'                   then select restaurant_id into p from public.orders where id = new.order_id;
    when 'reviews', 'payments'           then select restaurant_id into p from public.visits where id = new.visit_id;
    else p := coalesce(new.restaurant_id, public.my_restaurant(), public.only_restaurant());   -- categories, dining_tables, activity_log
  end case;
  if p is null then raise exception 'No restaurant is selected.'; end if;
  if new.restaurant_id is null then new.restaurant_id := p;
  elsif new.restaurant_id <> p then raise exception 'That belongs to another restaurant.';
  end if;
  if tg_table_name = 'orders' then
    if not exists (select 1 from public.dining_tables where id = new.table_id and restaurant_id = p) then
      raise exception 'That belongs to another restaurant.';
    end if;
    if tg_op = 'INSERT' then   -- order numbers count per restaurant
      update public.restaurants set last_order_no = last_order_no + 1 where id = p returning last_order_no into new.no;
    end if;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['categories','items','dining_tables','visits','orders','order_items','calls','reviews','payments','activity_log'] loop
    execute format('drop trigger if exists a_restaurant_id on public.%I', t);
    execute format('create trigger a_restaurant_id before insert or update on public.%I for each row execute function public.set_restaurant_id()', t);
  end loop;
end $$;

-- Settings never change restaurant either
create or replace function public.settings_keep_restaurant() returns trigger
language plpgsql as $$ begin
  if new.restaurant_id is distinct from old.restaurant_id then raise exception 'Rows can''t move between restaurants.'; end if;
  return new;
end $$;
create trigger a_restaurant_id before update on public.settings for each row execute function public.settings_keep_restaurant();

-- -----------------------------------------------------------------------------
-- Activity log: per restaurant
-- -----------------------------------------------------------------------------
create or replace function public.log_at(p_restaurant uuid, p_action text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (restaurant_id, by_id, by_name, action, detail)
  values (p_restaurant, auth.uid(),
          coalesce((select nullif(name, '') from public.memberships where user_id = auth.uid() and restaurant_id = p_restaurant),
                   (select name from public.staff where id = auth.uid()), ''),
          p_action, left(coalesce(p_detail, ''), 300));
$$;
create or replace function public.log_it(p_action text, p_detail text) returns void
language sql security definer set search_path = public as $$
  select public.log_at(public.my_restaurant(), p_action, p_detail);
$$;

create or replace function public.audit_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public.log_at(new.restaurant_id, 'dish_added', new.name || ' · ₹' || new.price);
  elsif tg_op = 'UPDATE' then
    if old.price is distinct from new.price or old.sizes is distinct from new.sizes or old.addons is distinct from new.addons then
      perform public.log_at(new.restaurant_id, 'price_changed', new.name || ' · ₹' || old.price || ' → ₹' || new.price
        || case when old.sizes is distinct from new.sizes or old.addons is distinct from new.addons then ' · sizes/extras changed' else '' end);
    end if;
    if old.name is distinct from new.name then perform public.log_at(new.restaurant_id, 'dish_renamed', old.name || ' → ' || new.name); end if;
  elsif tg_op = 'DELETE' then
    -- skipped when the whole restaurant is being deleted
    if exists (select 1 from public.restaurants where id = old.restaurant_id) then
      perform public.log_at(old.restaurant_id, 'dish_deleted', old.name || ' · ₹' || old.price);
    end if;
  end if;
  return null;
end $$;

create or replace function public.audit_visits() returns trigger
language plpgsql security definer set search_path = public as $$
declare tcode text;
begin
  if auth.uid() is null or new.status not in ('open', 'bill') then return null; end if;
  if old.split is distinct from new.split or old.tip_pct is distinct from new.tip_pct then
    select code into tcode from public.dining_tables where id = new.table_id;
    perform public.log_at(new.restaurant_id, 'bill_changed', tcode || ' · split ' || old.split || '→' || new.split || ' · tip ' || old.tip_pct || '%→' || new.tip_pct || '%');
  end if;
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- New logins
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text; invited uuid; only_one uuid := public.only_restaurant(); first_one boolean;
begin
  nm := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
                 nullif(initcap(trim(regexp_replace(split_part(new.email, '@', 1), '[^A-Za-z]+', ' ', 'g'))), ''), 'Staff');
  insert into public.staff (id, name, email, role, active) values (new.id, nm, new.email, 'waiter', false)
  on conflict (id) do nothing;
  -- app_metadata can only be set with the service key (team-admin), never by the person signing up
  begin invited := nullif(new.raw_app_meta_data ->> 'restaurant_id', '')::uuid;
  exception when others then invited := null; end;
  if invited is not null and exists (select 1 from public.restaurants where id = invited) then
    insert into public.memberships (restaurant_id, user_id, role, active, name) values (invited, new.id, 'waiter', false, nm)
    on conflict do nothing;
  elsif only_one is not null then
    first_one := not exists (select 1 from public.memberships);
    insert into public.memberships (restaurant_id, user_id, role, active, name)
    values (only_one, new.id, case when first_one then 'owner' else 'waiter' end, first_one, nm)
    on conflict do nothing;
  end if;
  return new;
end $$;

-- Any signed-in person can start a restaurant and becomes its owner.
create or replace function public.create_restaurant(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; nm text := trim(coalesce(p_name, '')); base text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if length(nm) not between 2 and 80 then raise exception 'Give the restaurant a name (2 to 80 letters).'; end if;
  if (select count(*) from public.restaurants where created_by = auth.uid()) >= 10 then
    raise exception 'You already have 10 restaurants. Ask us to raise the limit.';
  end if;
  base := trim(both '-' from regexp_replace(lower(nm), '[^a-z0-9]+', '-', 'g'));
  if length(base) < 3 then base := 'restaurant'; end if;
  insert into public.restaurants (slug, name, created_by)
  values (left(base, 50) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6), nm, auth.uid()) returning id into rid;
  insert into public.settings (restaurant_id, restaurant_name) values (rid, nm);
  insert into public.staff (id, name, email) select u.id, split_part(u.email, '@', 1), u.email from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
  insert into public.memberships (restaurant_id, user_id, role, active, name)
  values (rid, auth.uid(), 'owner', true, coalesce((select name from public.staff where id = auth.uid()), ''));
  update public.staff set current_restaurant = rid where id = auth.uid();
  perform public.log_at(rid, 'restaurant_created', nm);
  return rid;
end $$;

-- The restaurants this person belongs to (for the restaurant switcher)
create or replace function public.staff_restaurants() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'role', m.role, 'active', m.active and r.status = 'active',
           'current', r.id = public.my_restaurant()) order by r.name), '[]')
    from public.memberships m join public.restaurants r on r.id = m.restaurant_id
   where m.user_id = auth.uid();
$$;

create or replace function public.staff_switch_restaurant(p_restaurant uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.memberships m join public.restaurants r on r.id = m.restaurant_id
                  where m.user_id = auth.uid() and m.restaurant_id = p_restaurant and m.active and r.status = 'active') then
    raise exception 'You don''t have access to this.' using errcode = '42501';
  end if;
  update public.staff set current_restaurant = p_restaurant where id = auth.uid();
  return public.staff_me();
end $$;

-- -----------------------------------------------------------------------------
-- Money helpers: prices only from this restaurant's menu, settings from this restaurant
-- -----------------------------------------------------------------------------
drop function if exists public.price_cart(jsonb);
create function public.price_cart(p_items jsonb, p_restaurant uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; m record; v_qty int; v_size text; v_unit numeric; v_addons text[]; a text; ap numeric;
  out_lines jsonb := '[]'; v_count int := 0; v_found boolean;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your order is empty.';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'That''s a lot of dishes. Please ask a waiter.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    begin
      -- only dishes of this restaurant: an id from another restaurant counts as not on the menu
      select i.*, c.active as cat_active into m
        from public.items i join public.categories c on c.id = i.category_id
       where i.id = nullif(it ->> 'id', '')::uuid and i.restaurant_id = p_restaurant;
      v_found := found;
    exception when invalid_text_representation then v_found := false;
    end;
    if not v_found then raise exception 'A dish in your order is no longer on the menu. Please refresh.'; end if;
    if not m.cat_active then raise exception 'A dish in your order is no longer on the menu. Please refresh.'; end if;
    if not m.available then raise exception '% is sold out right now.', m.name; end if;
    v_qty := coalesce((it ->> 'qty')::int, 1);
    if v_qty < 1 or v_qty > 50 then raise exception 'Check the quantity for %.', m.name; end if;
    v_count := v_count + v_qty;
    v_size := coalesce(it ->> 'size', '');
    v_unit := m.price;
    if jsonb_array_length(m.sizes) > 0 then
      select (s ->> 'price')::numeric into v_unit from jsonb_array_elements(m.sizes) s where s ->> 'name' = v_size;
      if v_unit is null then raise exception 'Pick a size for %.', m.name; end if;
    else v_size := ''; end if;
    v_addons := '{}';
    if jsonb_typeof(it -> 'addons') = 'array' then
      for a in select distinct jsonb_array_elements_text(it -> 'addons') loop
        select (x ->> 'price')::numeric into ap from jsonb_array_elements(m.addons) x where x ->> 'name' = a;
        if ap is null then raise exception 'An extra for % is no longer offered. Please refresh.', m.name; end if;
        v_unit := v_unit + ap; v_addons := v_addons || a; ap := null;
      end loop;
    end if;
    out_lines := out_lines || jsonb_build_object('item_id', m.id, 'name', m.name, 'size', v_size, 'addons', to_jsonb(v_addons),
      'diet', m.diet, 'qty', v_qty, 'unit_price', v_unit, 'line_total', v_unit * v_qty, 'note', left(coalesce(it ->> 'note', ''), 200));
  end loop;
  if v_count > 60 then raise exception 'That''s a lot of dishes. Please ask a waiter.'; end if;
  return out_lines;
end $$;

create or replace function public.visit_bill(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v record; s record; sub numeric; svc numeric; tax numeric; tot numeric; tp numeric; lines jsonb;
begin
  select * into v from public.visits where id = p_visit;
  if not found then return null; end if;
  select * into s from public.settings where restaurant_id = v.restaurant_id;
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'size', size, 'addons', addons, 'qty', qty, 'amount', amount) order by first_at), '[]'),
         coalesce(sum(amount), 0)
    into lines, sub
    from (select oi.name, oi.size, oi.addons, sum(oi.qty) qty, sum(oi.line_total) amount, min(o.created_at) first_at
            from public.order_items oi join public.orders o on o.id = oi.order_id
           where o.visit_id = p_visit and o.status <> 'cancelled'
           group by oi.name, oi.size, oi.addons) g;
  if v.status = 'paid' then
    return jsonb_build_object('lines', lines, 'subtotal', v.subtotal, 'service', v.service, 'gst', v.gst, 'tip', v.tip,
      'total', v.total - v.tip, 'grand', v.total, 'split', v.split, 'each', ceil(v.total / v.split), 'tip_pct', v.tip_pct,
      'service_pct', s.service_pct, 'gst_pct', s.gst_pct);
  end if;
  svc := round(sub * s.service_pct / 100, 2);
  tax := round((sub + svc) * s.gst_pct / 100, 2);
  tot := round(sub + svc + tax);
  tp  := round(sub * v.tip_pct / 100);
  return jsonb_build_object('lines', lines, 'subtotal', sub, 'service', svc, 'gst', tax, 'tip', tp, 'total', tot,
    'grand', tot + tp, 'split', v.split, 'each', ceil((tot + tp) / v.split), 'tip_pct', v.tip_pct,
    'service_pct', s.service_pct, 'gst_pct', s.gst_pct);
end $$;

-- A QR works only for an active table in an active restaurant
create or replace function public.table_by_token(p_token text) returns public.dining_tables
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables;
begin
  select d.* into t from public.dining_tables d join public.restaurants r on r.id = d.restaurant_id
   where d.token = p_token and d.active and r.status = 'active';
  if not found then raise exception 'This QR code isn''t active. Please ask a waiter.' using errcode = 'P0002'; end if;
  return t;
end $$;

create or replace function public.add_order(p_table uuid, p_items jsonb, p_note text, p_guests int, p_source text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits; o public.orders; lines jsonb; l jsonb; rid uuid;
begin
  select restaurant_id into rid from public.dining_tables where id = p_table;
  if rid is null then raise exception 'Unknown table.'; end if;
  if p_request is not null then
    select * into o from public.orders where request_id = p_request;
    if found then
      if o.table_id <> p_table then raise exception 'That order belongs to another table.'; end if;
      return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true);
    end if;
  end if;
  lines := public.price_cart(p_items, rid);
  select * into v from public.visits where table_id = p_table and status in ('open', 'bill') for update;
  if not found then
    insert into public.visits (restaurant_id, table_id, guests) values (rid, p_table, case when p_guests between 1 and 40 then p_guests end)
    on conflict (table_id) where status in ('open', 'bill') do nothing
    returning * into v;
    if v.id is null then
      select * into v from public.visits where table_id = p_table and status in ('open', 'bill') for update;
    end if;
  else
    if p_source = 'guest' and exists (select 1 from public.orders where visit_id = v.id and source = 'guest' and created_at > now() - interval '15 seconds') then
      raise exception 'Your last order was just sent. Please wait a few seconds before ordering again.';
    end if;
    update public.visits set status = 'open', guests = coalesce(guests, case when p_guests between 1 and 40 then p_guests end)
     where id = v.id returning * into v;
  end if;
  insert into public.orders (restaurant_id, visit_id, table_id, source, created_by, note, request_id)
  values (rid, v.id, p_table, p_source, auth.uid(), left(coalesce(p_note, ''), 300), p_request) returning * into o;
  for l in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (restaurant_id, order_id, item_id, name, size, addons, diet, qty, unit_price, line_total, note)
    values (rid, o.id, (l ->> 'item_id')::uuid, l ->> 'name', l ->> 'size', array(select jsonb_array_elements_text(l -> 'addons')),
            l ->> 'diet', (l ->> 'qty')::int, (l ->> 'unit_price')::numeric, (l ->> 'line_total')::numeric, l ->> 'note');
  end loop;
  return jsonb_build_object('order', public.order_json(o), 'visit_id', v.id);
exception when unique_violation then
  select * into o from public.orders where request_id = p_request;
  if found then return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true); end if;
  raise;
end $$;

-- =============================================================================
-- GUEST functions: the restaurant comes from the table's QR token
-- =============================================================================
create or replace function public.guest_menu(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables; s public.settings;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where restaurant_id = t.restaurant_id;
  return jsonb_build_object(
    'table', jsonb_build_object('code', t.code, 'name', coalesce(nullif(t.name, ''), 'Table ' || t.code)),
    'place', jsonb_build_object('name', s.restaurant_name, 'tagline', s.tagline, 'currency', s.currency, 'accent', s.accent,
       'cover', s.cover_url,
       'accepting', s.accepting_orders, 'closed_message', s.closed_message, 'welcome', s.welcome_note,
       'gst_pct', s.gst_pct, 'service_pct', s.service_pct, 'tips', to_jsonb(s.tip_options),
       'pay', jsonb_build_object('upi', s.pay_upi and s.upi_id <> '', 'cash', s.pay_cash, 'card', s.pay_card),
       'has_wifi', s.wifi_name <> '', 'review_url', s.google_review_url),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort, c.name)
                              from public.categories c where c.restaurant_id = t.restaurant_id and c.active
                               and exists (select 1 from public.items i where i.category_id = c.id)), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'cat', i.category_id, 'name', i.name, 'desc', i.description,
                          'price', i.price, 'diet', i.diet, 'spice', i.spice, 'allergens', to_jsonb(i.allergens), 'sizes', i.sizes,
                          'addons', i.addons, 'photo', i.photo_url, 'best', i.bestseller, 'available', i.available) order by i.sort, i.name)
                         from public.items i join public.categories c on c.id = i.category_id
                        where i.restaurant_id = t.restaurant_id and c.active), '[]'));
end $$;

create or replace function public.guest_state(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; s public.settings; last_paid public.visits;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where restaurant_id = t.restaurant_id;
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill');
  if not found then
    select * into last_paid from public.visits where table_id = t.id and status = 'paid' and paid_at > now() - interval '2 hours'
     order by paid_at desc limit 1;
    return jsonb_build_object('visit', null, 'now', now(),
      'last_paid', case when last_paid.id is null then null else jsonb_build_object('id', last_paid.id, 'paid_at', last_paid.paid_at,
        'total', last_paid.total, 'reviewed', exists (select 1 from public.reviews where visit_id = last_paid.id)) end);
  end if;
  return jsonb_build_object('now', now(), 'last_paid', null,
    'visit', jsonb_build_object('id', v.id, 'status', v.status, 'guests', v.guests, 'split', v.split, 'tip_pct', v.tip_pct, 'pay_choice', v.pay_choice,
      'orders', coalesce((select jsonb_agg(public.order_json(o) order by o.created_at) from public.orders o where o.visit_id = v.id), '[]'),
      'calls', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'at', c.created_at, 'seen', c.seen_at is not null) order by c.created_at)
                           from public.calls c where c.visit_id = v.id and c.done_at is null), '[]'),
      'bill', public.visit_bill(v.id),
      'wifi', case when s.wifi_name <> '' then jsonb_build_object('name', s.wifi_name, 'password', s.wifi_password) end,
      'upi', case when s.pay_upi and s.upi_id <> '' then jsonb_build_object('id', s.upi_id, 'name', coalesce(nullif(s.upi_name, ''), s.restaurant_name)) end));
end $$;

create or replace function public.guest_order(p_token text, p_items jsonb, p_note text default '', p_guests int default null, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; s public.settings;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where restaurant_id = t.restaurant_id;
  if not s.accepting_orders then raise exception '%', s.closed_message; end if;
  return public.add_order(t.id, p_items, p_note, p_guests, 'guest', p_request_id);
end $$;

create or replace function public.guest_call(p_token text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v uuid;
begin
  t := public.table_by_token(p_token);
  if p_kind not in ('waiter', 'water', 'bill', 'help') then raise exception 'Unknown request.'; end if;
  select id into v from public.visits where table_id = t.id and status in ('open', 'bill');
  if exists (select 1 from public.calls where table_id = t.id and kind = p_kind and done_at is null) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if (select count(*) from public.calls where table_id = t.id and created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'We''ve got your requests. A waiter is on the way.';
  end if;
  insert into public.calls (restaurant_id, table_id, visit_id, kind) values (t.restaurant_id, t.id, v, p_kind);
  return jsonb_build_object('ok', true, 'already', false);
end $$;

create or replace function public.guest_bill(p_token text, p_split int, p_tip_pct numeric, p_pay text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; tips int[];
begin
  t := public.table_by_token(p_token);
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill') for update;
  if not found then raise exception 'There''s no open bill for this table.'; end if;
  if not exists (select 1 from public.orders where visit_id = v.id and status <> 'cancelled') then raise exception 'Nothing has been ordered yet.'; end if;
  select tip_options into tips from public.settings where restaurant_id = t.restaurant_id;
  if coalesce(p_tip_pct, 0) <> 0 and not (p_tip_pct::int = any (tips)) then raise exception 'Pick one of the tip options.'; end if;
  if coalesce(p_pay, '') not in ('', 'upi', 'cash', 'card') then raise exception 'Pick how you''d like to pay.'; end if;
  update public.visits set status = 'bill', bill_at = coalesce(bill_at, now()),
         split = greatest(1, least(coalesce(p_split, 1), 20)), tip_pct = coalesce(p_tip_pct, 0), pay_choice = coalesce(p_pay, '')
   where id = v.id;
  if not exists (select 1 from public.calls where table_id = t.id and kind = 'bill' and done_at is null) then
    insert into public.calls (restaurant_id, table_id, visit_id, kind) values (t.restaurant_id, t.id, v.id, 'bill');
  end if;
  return public.visit_bill(v.id);
end $$;

create or replace function public.guest_review(p_token text, p_visit uuid, p_stars int, p_comment text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables;
begin
  t := public.table_by_token(p_token);
  if not exists (select 1 from public.visits where id = p_visit and table_id = t.id and status in ('open', 'bill', 'paid')
                   and coalesce(paid_at, now()) > now() - interval '6 hours') then
    raise exception 'This visit can''t be rated any more.';
  end if;
  if p_stars not between 1 and 5 then raise exception 'Pick 1 to 5 stars.'; end if;
  insert into public.reviews (restaurant_id, visit_id, table_id, stars, comment) values (t.restaurant_id, p_visit, t.id, p_stars, left(coalesce(p_comment, ''), 600))
  on conflict (visit_id) do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- =============================================================================
-- STAFF functions: everything inside public.my_restaurant()
-- =============================================================================
create or replace function public.staff_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'name', coalesce(nullif(m.name, ''), s.name), 'email', s.email,
           'role', m.role, 'active', coalesce(m.active and r.status = 'active', false),
           'restaurant_id', m.restaurant_id, 'restaurant', r.name,
           'restaurants', (select count(*) from public.memberships where user_id = s.id))
    from public.staff s
    left join lateral (select * from public.memberships mm where mm.user_id = s.id
                        order by (mm.restaurant_id = public.my_restaurant()) desc nulls last,
                                 (mm.restaurant_id is not distinct from s.current_restaurant) desc, mm.active desc, mm.created_at
                        limit 1) m on true
    left join public.restaurants r on r.id = m.restaurant_id
   where s.id = auth.uid();
$$;

create or replace function public.staff_live() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
        rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_staff());
  return jsonb_build_object('now', now(), 'role', public.my_role(), 'restaurant_id', rid,
    'settings', (select jsonb_build_object('name', restaurant_name, 'currency', currency, 'accepting', accepting_orders,
                   'gst_pct', gst_pct, 'service_pct', service_pct, 'upi_id', upi_id, 'upi_name', upi_name) from public.settings where restaurant_id = rid),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'area', area, 'seats', seats, 'active', active)
                          order by sort, code) from public.dining_tables where restaurant_id = rid), '[]'),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table_id', v.table_id, 'status', v.status, 'opened_at', v.opened_at,
                          'bill_at', v.bill_at, 'guests', v.guests, 'split', v.split, 'tip_pct', v.tip_pct, 'pay_choice', v.pay_choice,
                          'bill', public.visit_bill(v.id),
                          'orders', coalesce((select jsonb_agg(public.order_json(o) order by o.created_at) from public.orders o where o.visit_id = v.id), '[]')))
                         from public.visits v where v.restaurant_id = rid and v.status in ('open', 'bill')), '[]'),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'table_id', c.table_id, 'kind', c.kind, 'at', c.created_at,
                          'seen_at', c.seen_at, 'seen_by', (select name from public.memberships where user_id = c.seen_by and restaurant_id = rid)) order by c.created_at)
                         from public.calls c where c.restaurant_id = rid and c.done_at is null), '[]'),
    'today', jsonb_build_object(
       'sales', (select coalesce(sum(total), 0) from public.visits where restaurant_id = rid and status = 'paid' and paid_at >= day_start),
       'bills', (select count(*) from public.visits where restaurant_id = rid and status = 'paid' and paid_at >= day_start),
       'orders', (select count(*) from public.orders where restaurant_id = rid and created_at >= day_start and status <> 'cancelled'),
       'guests', (select coalesce(sum(coalesce(guests, 0)), 0) from public.visits where restaurant_id = rid and opened_at >= day_start and status <> 'void'),
       'rating', (select round(avg(stars), 1) from public.reviews where restaurant_id = rid and created_at >= day_start),
       'flow', (select coalesce(jsonb_object_agg(h, n), '{}') from (
                  select extract(hour from opened_at at time zone 'Asia/Kolkata')::int h, count(*) n
                    from public.visits where restaurant_id = rid and opened_at >= day_start and status <> 'void' group by 1) x)));
end $$;

create or replace function public.staff_order_status(p_order uuid, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r text := public.my_role(); vs text;
begin
  perform public.need(r is not null);
  select * into o from public.orders where id = p_order and restaurant_id = public.my_restaurant() for update;
  if not found then raise exception 'That order is gone.'; end if;
  if p_status not in ('new', 'cooking', 'ready', 'served', 'cancelled') then raise exception 'Unknown status.'; end if;
  select status into vs from public.visits where id = o.visit_id;
  if vs in ('paid', 'void') then raise exception 'This bill is already closed, so its orders can''t change.'; end if;
  if o.status = p_status then return public.order_json(o); end if;
  if not public.order_step_ok(o.status, p_status) then
    raise exception 'This order is % and can''t go to % from there. Refresh the screen.', o.status, p_status;
  end if;
  if p_status = 'cancelled' then
    perform public.need(r in ('owner', 'manager') or (r = 'waiter' and o.status = 'new'));
  end if;
  update public.orders set status = p_status,
    started_at = case when p_status = 'new' then null else coalesce(started_at, case when p_status <> 'cancelled' then now() end) end,
    ready_at   = case when p_status in ('new', 'cooking') then null when p_status in ('ready', 'served') then coalesce(ready_at, now()) else ready_at end,
    served_at  = case when p_status = 'served' then coalesce(served_at, now()) when p_status = 'cancelled' then served_at else null end,
    cancel_reason = case when p_status = 'cancelled' then left(coalesce(p_reason, ''), 200) else '' end
   where id = p_order returning * into o;
  if p_status = 'cancelled' then perform public.log_it('order_cancelled', '#' || o.no || coalesce(' · ' || nullif(p_reason, ''), '')); end if;
  return public.order_json(o);
end $$;

create or replace function public.staff_add_order(p_table uuid, p_items jsonb, p_note text default '', p_guests int default null, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  if not exists (select 1 from public.dining_tables where id = p_table and restaurant_id = public.my_restaurant()) then raise exception 'Unknown table.'; end if;
  return public.add_order(p_table, p_items, p_note, p_guests, 'staff', p_request_id);
end $$;

create or replace function public.staff_call(p_call uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_floor());
  if p_action = 'seen' then
    update public.calls set seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid()) where id = p_call and restaurant_id = rid;
  elsif p_action = 'done' then
    update public.calls set done_at = now(), seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid()) where id = p_call and restaurant_id = rid;
  else raise exception 'Unknown action.'; end if;
end $$;

create or replace function public.staff_visit_update(p_visit uuid, p_split int, p_tip_pct numeric, p_guests int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  update public.visits set split = greatest(1, least(coalesce(p_split, split), 20)), tip_pct = greatest(0, least(coalesce(p_tip_pct, tip_pct), 30)),
         guests = coalesce(case when p_guests between 1 and 40 then p_guests end, guests)
   where id = p_visit and restaurant_id = public.my_restaurant() and status in ('open', 'bill');
  if not found then raise exception 'This table''s bill is already closed.'; end if;
  return public.visit_bill(p_visit);
end $$;

create or replace function public.staff_mark_paid(p_visit uuid, p_method text, p_reference text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; v public.visits; tcode text;
begin
  perform public.need(public.is_floor());
  if p_method not in ('upi', 'cash', 'card', 'mixed') then raise exception 'Pick how they paid.'; end if;
  if length(coalesce(p_reference, '')) > 60 then raise exception 'The reference is too long.'; end if;
  select * into v from public.visits where id = p_visit and restaurant_id = public.my_restaurant() for update;
  if not found or v.status not in ('open', 'bill') then raise exception 'This bill is already closed.'; end if;
  if exists (select 1 from public.orders where visit_id = p_visit and status in ('new', 'cooking')) then
    raise exception 'Some dishes are still with the kitchen. Serve or cancel them first.';
  end if;
  b := public.visit_bill(p_visit);
  update public.visits set status = 'paid', paid_at = now(), paid_method = p_method, paid_by = auth.uid(),
         subtotal = (b ->> 'subtotal')::numeric, service = (b ->> 'service')::numeric, gst = (b ->> 'gst')::numeric,
         tip = (b ->> 'tip')::numeric, total = (b ->> 'grand')::numeric
   where id = p_visit;
  insert into public.payments (restaurant_id, visit_id, method, amount, reference, created_by)
  values (v.restaurant_id, p_visit, p_method, (b ->> 'grand')::numeric, trim(coalesce(p_reference, '')), auth.uid());
  update public.orders set status = 'served', served_at = coalesce(served_at, now()) where visit_id = p_visit and status = 'ready';
  update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  select code into tcode from public.dining_tables where id = v.table_id;
  perform public.log_it('bill_paid', tcode || ' · ' || upper(p_method) || ' · ₹' || (b ->> 'grand')
                         || coalesce(' · ref ' || nullif(trim(p_reference), ''), ''));
  return public.visit_bill(p_visit);
end $$;

create or replace function public.staff_void_visit(p_visit uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.visits;
begin
  perform public.need(public.is_manager());
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a short reason.'; end if;
  update public.visits set status = 'void', void_reason = left(p_reason, 200)
   where id = p_visit and restaurant_id = public.my_restaurant() and status in ('open', 'bill') returning * into v;
  if not found then raise exception 'This bill is already closed.'; end if;
  update public.orders set status = 'cancelled', cancel_reason = 'Table cleared' where visit_id = p_visit and status in ('new', 'cooking');
  update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  perform public.log_it('table_cleared', (select code from public.dining_tables where id = v.table_id) || ' · ' || p_reason);
end $$;

create or replace function public.staff_menu() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_staff());
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(c) - 'restaurant_id' order by c.sort, c.name) from public.categories c where c.restaurant_id = rid), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'restaurant_id' order by i.sort, i.name) from public.items i where i.restaurant_id = rid), '[]'));
end $$;

create or replace function public.staff_item_available(p_item uuid, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  perform public.need(public.is_staff());
  update public.items set available = p_available where id = p_item and restaurant_id = public.my_restaurant() returning name into nm;
  if nm is null then raise exception 'That dish is gone.'; end if;
  perform public.log_it(case when p_available then 'back_on_menu' else 'sold_out' end, nm);
end $$;

create or replace function public.staff_bills(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_floor());
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table', t.code, 'opened_at', v.opened_at, 'paid_at', v.paid_at,
      'status', v.status, 'method', v.paid_method, 'total', v.total, 'tip', v.tip, 'guests', v.guests, 'void_reason', v.void_reason,
      'by', (select name from public.memberships where user_id = v.paid_by and restaurant_id = rid), 'bill', public.visit_bill(v.id),
      'ref', (select string_agg(nullif(p.reference, ''), ', ') from public.payments p where p.visit_id = v.id),
      'stars', (select stars from public.reviews where visit_id = v.id)) order by coalesce(v.paid_at, v.opened_at) desc)
    from public.visits v join public.dining_tables t on t.id = v.table_id
   where v.restaurant_id = rid and v.status in ('paid', 'void')
     and (coalesce(v.paid_at, v.opened_at) at time zone 'Asia/Kolkata')::date between p_from and p_to), '[]');
end $$;

-- =============================================================================
-- MANAGER / OWNER functions
-- =============================================================================
create or replace function public.owner_save_category(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  if v_id is null then
    insert into public.categories (restaurant_id, name, sort, active)
    values (rid, trim(p ->> 'name'), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.categories where restaurant_id = rid)),
            coalesce((p ->> 'active')::boolean, true)) returning id into v_id;
  else
    update public.categories set name = trim(coalesce(p ->> 'name', name)), sort = coalesce((p ->> 'sort')::int, sort), active = coalesce((p ->> 'active')::boolean, active)
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That section is gone.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.owner_delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  if exists (select 1 from public.items where category_id = p_id) then raise exception 'Move or delete the dishes in this section first.'; end if;
  delete from public.categories where id = p_id and restaurant_id = public.my_restaurant();
end $$;

create or replace function public.owner_save_item(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; sz jsonb := coalesce(p -> 'sizes', '[]'); ad jsonb := coalesce(p -> 'addons', '[]');
        rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  if jsonb_typeof(sz) <> 'array' or jsonb_typeof(ad) <> 'array' then raise exception 'Sizes and extras must be lists.'; end if;
  if exists (select 1 from jsonb_array_elements(sz || ad) x where length(trim(coalesce(x ->> 'name', ''))) = 0 or (x ->> 'price') is null or (x ->> 'price')::numeric < 0) then
    raise exception 'Every size and extra needs a name and a price.';
  end if;
  if not exists (select 1 from public.categories where id = nullif(p ->> 'category_id', '')::uuid and restaurant_id = rid) then
    raise exception 'Pick a section for this dish.';
  end if;
  if v_id is null then
    insert into public.items (restaurant_id, category_id, name, description, price, diet, spice, allergens, sizes, addons, photo_url, bestseller, available, sort)
    values (rid, (p ->> 'category_id')::uuid, trim(p ->> 'name'), coalesce(p ->> 'description', ''), coalesce((p ->> 'price')::numeric, 0),
            coalesce(p ->> 'diet', 'veg'), nullif(p ->> 'spice', '')::smallint,
            coalesce(array(select jsonb_array_elements_text(p -> 'allergens')), '{}'), sz, ad, coalesce(p ->> 'photo_url', ''),
            coalesce((p ->> 'bestseller')::boolean, false), coalesce((p ->> 'available')::boolean, true),
            coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.items where restaurant_id = rid)))
    returning id into v_id;
  else
    update public.items set category_id = (p ->> 'category_id')::uuid, name = trim(p ->> 'name'), description = coalesce(p ->> 'description', ''),
      price = coalesce((p ->> 'price')::numeric, 0), diet = coalesce(p ->> 'diet', 'veg'), spice = nullif(p ->> 'spice', '')::smallint,
      allergens = coalesce(array(select jsonb_array_elements_text(p -> 'allergens')), '{}'), sizes = sz, addons = ad,
      photo_url = coalesce(p ->> 'photo_url', ''), bestseller = coalesce((p ->> 'bestseller')::boolean, false),
      available = coalesce((p ->> 'available')::boolean, true), sort = coalesce((p ->> 'sort')::int, sort)
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That dish is gone.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.owner_delete_item(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  perform public.need(public.is_manager());
  delete from public.items where id = p_id and restaurant_id = public.my_restaurant() returning photo_url into ph;
  return ph;
end $$;

create or replace function public.owner_save_table(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  if v_id is null then
    insert into public.dining_tables (restaurant_id, code, name, area, seats, sort, active)
    values (rid, upper(trim(p ->> 'code')), coalesce(p ->> 'name', ''), coalesce(nullif(trim(p ->> 'area'), ''), 'Main'),
            coalesce((p ->> 'seats')::int, 4), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.dining_tables where restaurant_id = rid)),
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update public.dining_tables set code = upper(trim(p ->> 'code')), name = coalesce(p ->> 'name', ''), area = coalesce(nullif(trim(p ->> 'area'), ''), 'Main'),
      seats = coalesce((p ->> 'seats')::int, seats), sort = coalesce((p ->> 'sort')::int, sort), active = coalesce((p ->> 'active')::boolean, active)
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That table is gone.'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Another table already uses that number.';
end $$;

create or replace function public.owner_delete_table(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  if exists (select 1 from public.visits where table_id = p_id) then raise exception 'This table has bills on record. Switch it off instead.'; end if;
  delete from public.dining_tables where id = p_id and restaurant_id = public.my_restaurant();
end $$;

create or replace function public.owner_table_tokens() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  return coalesce((select jsonb_object_agg(id, token) from public.dining_tables where restaurant_id = public.my_restaurant()), '{}');
end $$;

create or replace function public.owner_new_token(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text; c text;
begin
  perform public.need(public.is_manager());
  update public.dining_tables set token = encode(gen_random_bytes(9), 'hex')
   where id = p_id and restaurant_id = public.my_restaurant() returning token, code into t, c;
  if t is null then raise exception 'That table is gone.'; end if;
  perform public.log_it('qr_replaced', c);
  return t;
end $$;

create or replace function public.owner_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_staff());
  return (select to_jsonb(s) - 'id' - 'restaurant_id' from public.settings s where restaurant_id = public.my_restaurant());
end $$;

create or replace function public.owner_save_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
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
   where restaurant_id = rid;
  -- the restaurant's own name follows the settings name
  if nullif(trim(p ->> 'restaurant_name'), '') is not null then
    update public.restaurants set name = left(trim(p ->> 'restaurant_name'), 80) where id = rid;
  end if;
  if p ? 'accepting_orders' then perform public.log_it(case when (p ->> 'accepting_orders')::boolean then 'orders_on' else 'orders_off' end, ''); end if;
  if p ? 'restaurant_name' or p ? 'upi_id' or p ? 'gst_pct' or p ? 'cover_url' then perform public.log_it('settings_changed', ''); end if;
end $$;

create or replace function public.owner_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text := 'Asia/Kolkata'; rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  return jsonb_build_object(
    'sales',   (select coalesce(sum(total), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'tips',    (select coalesce(sum(tip), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'gst',     (select coalesce(sum(gst), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'bills',   (select count(*) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'guests',  (select coalesce(sum(guests), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'voids',   (select count(*) from public.visits where restaurant_id = rid and status = 'void' and (opened_at at time zone tz)::date between p_from and p_to),
    'by_day',  (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'sales', s, 'bills', n) order by d), '[]') from (
                  select (paid_at at time zone tz)::date d, sum(total) s, count(*) n from public.visits
                   where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to group by 1) x),
    'by_hour', (select coalesce(jsonb_object_agg(h, n), '{}') from (
                  select extract(hour from opened_at at time zone tz)::int h, count(*) n from public.visits
                   where restaurant_id = rid and status = 'paid' and (opened_at at time zone tz)::date between p_from and p_to group by 1) x),
    'methods', (select coalesce(jsonb_object_agg(paid_method, s), '{}') from (
                  select paid_method, sum(total) s from public.visits
                   where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to group by 1) x),
    'top',     (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'amount', a) order by q desc, a desc), '[]') from (
                  select oi.name, sum(oi.qty) q, sum(oi.line_total) a from public.order_items oi
                    join public.orders o on o.id = oi.order_id join public.visits v on v.id = o.visit_id
                   where v.restaurant_id = rid and v.status = 'paid' and o.status <> 'cancelled' and (v.paid_at at time zone tz)::date between p_from and p_to
                   group by oi.name order by 2 desc limit 10) x),
    'prep_mins', (select round(avg(extract(epoch from ready_at - created_at)) / 60, 1) from public.orders
                   where restaurant_id = rid and ready_at is not null and (created_at at time zone tz)::date between p_from and p_to),
    'rating',  (select round(avg(stars), 2) from public.reviews where restaurant_id = rid and (created_at at time zone tz)::date between p_from and p_to),
    'ratings', (select count(*) from public.reviews where restaurant_id = rid and (created_at at time zone tz)::date between p_from and p_to),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('stars', r.stars, 'comment', r.comment, 'at', r.created_at,
                    'table', (select code from public.dining_tables where id = r.table_id)) order by r.created_at desc), '[]')
                  from (select * from public.reviews where restaurant_id = rid and (created_at at time zone tz)::date between p_from and p_to
                         order by created_at desc limit 50) r));
end $$;

-- Team ------------------------------------------------------------------------------
create or replace function public.owner_team() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  return jsonb_build_object('staff', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(nullif(m.name, ''), s.name),
    'email', s.email, 'phone', m.phone, 'role', m.role, 'active', m.active, 'created_at', m.created_at) order by m.created_at)
    from public.memberships m join public.staff s on s.id = m.user_id where m.restaurant_id = public.my_restaurant()), '[]'));
end $$;

-- True when the owner may change this person's login itself (email, password, delete):
-- they work here and nowhere else the caller doesn't own. Used by team-admin.
create or replace function public.owner_controls_login(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  return exists (select 1 from public.memberships where user_id = p_id and restaurant_id = public.my_restaurant())
     and not exists (select 1 from public.memberships m where m.user_id = p_id
                       and not exists (select 1 from public.memberships o where o.restaurant_id = m.restaurant_id
                                          and o.user_id = auth.uid() and o.role = 'owner' and o.active));
end $$;

create or replace function public.owner_edit_staff(p_id uuid, p_name text, p_phone text, p_role text, p_active boolean, p_email text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_owner());
  if p_role not in ('owner', 'manager', 'waiter', 'kitchen') then raise exception 'Unknown role.'; end if;
  if p_id = auth.uid() and (p_role <> 'owner' or p_active = false) then raise exception 'You can''t remove your own owner access.'; end if;
  update public.memberships set name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone), role = p_role,
         active = coalesce(p_active, active)
   where user_id = p_id and restaurant_id = rid;
  if not found then raise exception 'That person isn''t on your team.'; end if;
  -- the login's own details only when this owner controls the login
  if public.owner_controls_login(p_id) then
    update public.staff set name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone),
           email = coalesce(nullif(lower(trim(p_email)), ''), email) where id = p_id;
  end if;
  perform public.log_it('login_changed', coalesce(p_name, '') || ' (' || p_role || ')');
end $$;

-- Takes the person off this restaurant's team. Returns true when the login itself may be
-- deleted too (they work nowhere else); otherwise only the membership goes.
drop function if exists public.owner_prepare_delete(uuid);
create function public.owner_prepare_delete(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant(); nm text; whole boolean;
begin
  perform public.need(public.is_owner());
  if p_id = auth.uid() then raise exception 'You can''t delete your own login.'; end if;
  select coalesce(nullif(m.name, ''), s.name) into nm from public.memberships m join public.staff s on s.id = m.user_id
   where m.user_id = p_id and m.restaurant_id = rid;
  if nm is null then raise exception 'That person isn''t on your team.'; end if;
  whole := not exists (select 1 from public.memberships where user_id = p_id and restaurant_id <> rid);
  if whole then
    update public.memberships set active = false where user_id = p_id and restaurant_id = rid;
  else
    delete from public.memberships where user_id = p_id and restaurant_id = rid;
  end if;
  perform public.log_it('login_deleted', nm);
  return whole;
end $$;

create or replace function public.owner_log(p_action text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.need(public.is_owner()); perform public.log_it(p_action, p_detail); end $$;

create or replace function public.owner_activity(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  return coalesce((select jsonb_agg(to_jsonb(a) - 'restaurant_id' order by a.at desc)
                     from (select * from public.activity_log where restaurant_id = public.my_restaurant()
                            order by at desc limit least(p_limit, 500)) a), '[]');
end $$;

-- -----------------------------------------------------------------------------
-- Dish photos: each restaurant uploads into its own folder (<restaurant id>/...).
-- A one-restaurant install may still use the top folder, as the current app does.
-- -----------------------------------------------------------------------------
create or replace function public.photo_path_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_manager() and (split_part(p_name, '/', 1) = public.my_restaurant()::text
         or (position('/' in p_name) = 0 and public.only_restaurant() is not null));
$$;
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "menu photos upload" on storage.objects';
    execute 'drop policy if exists "menu photos change" on storage.objects';
    execute 'drop policy if exists "menu photos delete" on storage.objects';
    execute $p$create policy "menu photos upload" on storage.objects for insert to authenticated
             with check (bucket_id = 'menu-photos' and public.photo_path_ok(name))$p$;
    execute $p$create policy "menu photos change" on storage.objects for update to authenticated
             using (bucket_id = 'menu-photos' and public.photo_path_ok(name))$p$;
    execute $p$create policy "menu photos delete" on storage.objects for delete to authenticated
             using (bucket_id = 'menu-photos' and public.photo_path_ok(name))$p$;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Who may call what. Guests: exactly the six guest_* functions.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.guest_menu(text), public.guest_state(text), public.guest_order(text, jsonb, text, int, uuid),
  public.guest_call(text, text), public.guest_bill(text, int, numeric, text), public.guest_review(text, uuid, int, text)
  to anon, authenticated;
grant execute on function public.staff_me(), public.staff_live(), public.staff_order_status(uuid, text, text),
  public.staff_add_order(uuid, jsonb, text, int, uuid), public.staff_call(uuid, text), public.staff_visit_update(uuid, int, numeric, int),
  public.staff_mark_paid(uuid, text, text), public.staff_void_visit(uuid, text), public.staff_menu(), public.staff_item_available(uuid, boolean),
  public.staff_bills(date, date),
  public.owner_save_category(jsonb), public.owner_delete_category(uuid), public.owner_save_item(jsonb), public.owner_delete_item(uuid),
  public.owner_save_table(jsonb), public.owner_delete_table(uuid), public.owner_table_tokens(), public.owner_new_token(uuid),
  public.owner_settings(), public.owner_save_settings(jsonb), public.owner_report(date, date),
  public.owner_team(), public.owner_edit_staff(uuid, text, text, text, boolean, text), public.owner_prepare_delete(uuid),
  public.owner_controls_login(uuid), public.owner_log(text, text), public.owner_activity(int),
  public.create_restaurant(text), public.staff_restaurants(), public.staff_switch_restaurant(uuid),
  public.is_staff(), public.is_manager(), public.is_owner()
  to authenticated;
grant execute on function public.photo_path_ok(text) to authenticated;   -- used by the storage rules above
