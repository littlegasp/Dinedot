-- =============================================================================
-- Dinedot — QR table ordering. Database (Supabase, Mumbai region)
-- Run once: Supabase dashboard → SQL Editor → New query → paste this file → Run.
--
-- How it is locked down
-- * Every table has row level security ON and no direct access for anon or signed-in users.
-- * Guests (anon) can only call the guest_* functions, and every one of them needs the
--   table's secret QR token. A guest can see only their own table's current visit.
-- * Prices are always worked out here from the menu, never taken from the browser.
-- * Staff sign in (Supabase Auth). The first login ever created becomes the owner;
--   every later login starts switched off until the owner sets it up in the staff app.
-- Roles: owner (everything) · manager (everything except team and settings) ·
--        waiter (floor, calls, orders, bills) · kitchen (kitchen screen, sold-out switch).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Staff
-- -----------------------------------------------------------------------------
create table public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text,
  phone       text not null default '',
  role        text not null default 'waiter' check (role in ('owner', 'manager', 'waiter', 'kitchen')),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where id = auth.uid() and active;
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() is not null $$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() in ('owner', 'manager') $$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() = 'owner' $$;
create or replace function public.is_floor() returns boolean   -- can take orders, bills and calls
language sql stable security definer set search_path = public as $$ select public.my_role() in ('owner', 'manager', 'waiter') $$;

create or replace function public.need(ok boolean) returns void
language plpgsql as $$ begin if not coalesce(ok, false) then raise exception 'You don''t have access to this.' using errcode = '42501'; end if; end $$;

create or replace function public.handle_new_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_one boolean := not exists (select 1 from public.staff);
begin
  insert into public.staff (id, name, email, role, active)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
                   nullif(initcap(trim(regexp_replace(split_part(new.email, '@', 1), '[^A-Za-z]+', ' ', 'g'))), ''), 'Staff'),
          new.email,
          case when first_one then 'owner' else 'waiter' end,
          first_one);
  return new;
end $$;
create trigger on_auth_user_created_dinedot
  after insert on auth.users for each row execute function public.handle_new_staff();

-- Owner-only activity log (never stores guests' details)
create table public.activity_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  by_id   uuid,
  by_name text not null default '',
  action  text not null,
  detail  text not null default ''
);
create or replace function public.log_it(p_action text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (by_id, by_name, action, detail)
  values (auth.uid(), coalesce((select name from public.staff where id = auth.uid()), ''), p_action, left(coalesce(p_detail, ''), 300));
$$;

-- -----------------------------------------------------------------------------
-- Settings (one row)
-- -----------------------------------------------------------------------------
create table public.settings (
  id                 int primary key default 1 check (id = 1),
  restaurant_name    text not null default 'Your Restaurant',
  tagline            text not null default '',
  currency           text not null default '₹',
  accent             text not null default '#F5A524' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  accepting_orders   boolean not null default true,
  closed_message     text not null default 'The kitchen is closed right now. Please ask a waiter.',
  wifi_name          text not null default '',
  wifi_password      text not null default '',
  upi_id             text not null default '',
  upi_name           text not null default '',
  gst_pct            numeric(5,2) not null default 5 check (gst_pct between 0 and 28),
  service_pct        numeric(5,2) not null default 0 check (service_pct between 0 and 20),
  tip_options        int[] not null default '{0,5,10}',
  pay_cash           boolean not null default true,
  pay_card           boolean not null default true,
  pay_upi            boolean not null default true,
  google_review_url  text not null default '',
  welcome_note       text not null default '',
  updated_at         timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- -----------------------------------------------------------------------------
-- Menu
-- -----------------------------------------------------------------------------
create table public.categories (
  id      uuid primary key default gen_random_uuid(),
  name    text not null check (length(trim(name)) between 1 and 60),
  sort    int  not null default 0,
  active  boolean not null default true
);

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories (id) on delete restrict,
  name         text not null check (length(trim(name)) between 1 and 80),
  description  text not null default '',
  price        numeric(10,2) not null check (price >= 0),
  diet         text not null default 'veg' check (diet in ('veg', 'nonveg', 'egg')),
  spice        smallint check (spice between 0 and 5),
  allergens    text[] not null default '{}',
  sizes        jsonb not null default '[]',   -- [{"name":"Half","price":220},{"name":"Full","price":380}] (price replaces the base price)
  addons       jsonb not null default '[]',   -- [{"name":"Extra cheese","price":40}]
  photo_url    text not null default '',
  bestseller   boolean not null default false,
  available    boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  constraint sizes_is_list  check (jsonb_typeof(sizes) = 'array'),
  constraint addons_is_list check (jsonb_typeof(addons) = 'array')
);
create index on public.items (category_id, sort);

-- -----------------------------------------------------------------------------
-- Tables (each has a secret token printed in its QR code)
-- -----------------------------------------------------------------------------
create table public.dining_tables (
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique check (code ~ '^[A-Za-z0-9-]{1,12}$'),
  name    text not null default '',
  area    text not null default 'Main',
  seats   int  not null default 4 check (seats between 1 and 40),
  sort    int  not null default 0,
  active  boolean not null default true,
  token   text not null unique default encode(gen_random_bytes(9), 'hex')
);

-- One visit per table, from the first order until the bill is paid
create table public.visits (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid not null references public.dining_tables (id) on delete cascade,
  opened_at    timestamptz not null default now(),
  status       text not null default 'open' check (status in ('open', 'bill', 'paid', 'void')),
  guests       int check (guests between 1 and 40),
  split        int not null default 1 check (split between 1 and 20),
  tip_pct      numeric(5,2) not null default 0 check (tip_pct between 0 and 30),
  pay_choice   text not null default '' check (pay_choice in ('', 'upi', 'cash', 'card')),
  bill_at      timestamptz,
  paid_at      timestamptz,
  paid_method  text check (paid_method in ('upi', 'cash', 'card', 'mixed')),
  paid_by      uuid,
  subtotal     numeric(10,2) not null default 0,
  service      numeric(10,2) not null default 0,
  gst          numeric(10,2) not null default 0,
  tip          numeric(10,2) not null default 0,
  total        numeric(10,2) not null default 0,   -- grand total incl. tip, frozen when paid
  void_reason  text not null default ''
);
create unique index one_open_visit_per_table on public.visits (table_id) where status in ('open', 'bill');
create index on public.visits (paid_at);

create sequence public.order_no_seq;
create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  no          int  not null default nextval('public.order_no_seq'),
  visit_id    uuid not null references public.visits (id) on delete cascade,
  table_id    uuid not null references public.dining_tables (id) on delete cascade,
  source      text not null default 'guest' check (source in ('guest', 'staff')),
  created_by  uuid,
  status      text not null default 'new' check (status in ('new', 'cooking', 'ready', 'served', 'cancelled')),
  note        text not null default '' check (length(note) <= 300),
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  ready_at    timestamptz,
  served_at   timestamptz,
  cancel_reason text not null default ''
);
create index on public.orders (visit_id);
create index on public.orders (status, created_at);

create table public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  item_id     uuid references public.items (id) on delete set null,
  name        text not null,
  size        text not null default '',
  addons      text[] not null default '{}',
  diet        text not null default 'veg',
  qty         int  not null check (qty between 1 and 50),
  unit_price  numeric(10,2) not null,
  line_total  numeric(10,2) not null,
  note        text not null default '' check (length(note) <= 200)
);
create index on public.order_items (order_id);

create table public.calls (
  id         uuid primary key default gen_random_uuid(),
  table_id   uuid not null references public.dining_tables (id) on delete cascade,
  visit_id   uuid references public.visits (id) on delete cascade,
  kind       text not null check (kind in ('waiter', 'water', 'bill', 'help')),
  created_at timestamptz not null default now(),
  seen_at    timestamptz,
  seen_by    uuid,
  done_at    timestamptz
);
create index on public.calls (done_at, created_at);

create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  visit_id   uuid not null unique references public.visits (id) on delete cascade,
  table_id   uuid references public.dining_tables (id) on delete set null,
  stars      int not null check (stars between 1 and 5),
  comment    text not null default '' check (length(comment) <= 600),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Lock everything: no direct table access; only the functions below.
-- -----------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['staff','activity_log','settings','categories','items','dining_tables','visits','orders','order_items','calls','reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.order_no_seq from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

-- -----------------------------------------------------------------------------
-- Money helpers
-- -----------------------------------------------------------------------------
-- Prices a cart from the menu. p_items: [{"id":uuid,"qty":n,"size":"Half","addons":["Extra cheese"],"note":""}]
create or replace function public.price_cart(p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; m record; v_qty int; v_size text; v_unit numeric; v_addons text[]; a text; ap numeric;
  out_lines jsonb := '[]'; v_count int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your order is empty.';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'That''s a lot of dishes. Please ask a waiter.'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select i.*, c.active as cat_active into m
      from public.items i join public.categories c on c.id = i.category_id
     where i.id = nullif(it ->> 'id', '')::uuid;
    if not found or not m.cat_active then raise exception 'A dish in your order is no longer on the menu. Please refresh.'; end if;
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

-- Works out a visit's bill from its (not cancelled) orders and the current settings.
create or replace function public.visit_bill(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v record; s record; sub numeric; svc numeric; tax numeric; tot numeric; tp numeric; lines jsonb;
begin
  select * into v from public.visits where id = p_visit;
  if not found then return null; end if;
  select * into s from public.settings where id = 1;
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

create or replace function public.order_json(o public.orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'no', o.no, 'status', o.status, 'source', o.source, 'note', o.note,
    'created_at', o.created_at, 'started_at', o.started_at, 'ready_at', o.ready_at, 'served_at', o.served_at,
    'cancel_reason', o.cancel_reason,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'size', size, 'addons', addons, 'qty', qty,
                         'diet', diet, 'note', note, 'amount', line_total) order by id)
                       from public.order_items where order_id = o.id), '[]'));
$$;

create or replace function public.table_by_token(p_token text) returns public.dining_tables
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables;
begin
  select * into t from public.dining_tables where token = p_token and active;
  if not found then raise exception 'This QR code isn''t active. Please ask a waiter.' using errcode = 'P0002'; end if;
  return t;
end $$;

-- Adds an order to the table's open visit (opening one if needed). Used by guests and staff.
create or replace function public.add_order(p_table uuid, p_items jsonb, p_note text, p_guests int, p_source text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.visits; o public.orders; lines jsonb; l jsonb;
begin
  lines := public.price_cart(p_items);
  select * into v from public.visits where table_id = p_table and status in ('open', 'bill') for update;
  if not found then
    insert into public.visits (table_id, guests) values (p_table, case when p_guests between 1 and 40 then p_guests end) returning * into v;
  else
    if p_source = 'guest' and exists (select 1 from public.orders where visit_id = v.id and source = 'guest' and created_at > now() - interval '15 seconds') then
      raise exception 'Your last order was just sent. Please wait a few seconds before ordering again.';
    end if;
    update public.visits set status = 'open', guests = coalesce(guests, case when p_guests between 1 and 40 then p_guests end)
     where id = v.id returning * into v;
  end if;
  insert into public.orders (visit_id, table_id, source, created_by, note)
  values (v.id, p_table, p_source, auth.uid(), left(coalesce(p_note, ''), 300)) returning * into o;
  for l in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (order_id, item_id, name, size, addons, diet, qty, unit_price, line_total, note)
    values (o.id, (l ->> 'item_id')::uuid, l ->> 'name', l ->> 'size', array(select jsonb_array_elements_text(l -> 'addons')),
            l ->> 'diet', (l ->> 'qty')::int, (l ->> 'unit_price')::numeric, (l ->> 'line_total')::numeric, l ->> 'note');
  end loop;
  return jsonb_build_object('order', public.order_json(o), 'visit_id', v.id);
end $$;

-- =============================================================================
-- GUEST functions (anon). Every one needs the table's QR token.
-- =============================================================================
create or replace function public.guest_menu(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables; s public.settings;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where id = 1;
  return jsonb_build_object(
    'table', jsonb_build_object('code', t.code, 'name', coalesce(nullif(t.name, ''), 'Table ' || t.code)),
    'place', jsonb_build_object('name', s.restaurant_name, 'tagline', s.tagline, 'currency', s.currency, 'accent', s.accent,
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

create or replace function public.guest_state(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; s public.settings; last_paid public.visits;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where id = 1;
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

create or replace function public.guest_order(p_token text, p_items jsonb, p_note text default '', p_guests int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables;
begin
  t := public.table_by_token(p_token);
  if not (select accepting_orders from public.settings where id = 1) then
    raise exception '%', (select closed_message from public.settings where id = 1);
  end if;
  return public.add_order(t.id, p_items, p_note, p_guests, 'guest');
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
  insert into public.calls (table_id, visit_id, kind) values (t.id, v, p_kind);
  return jsonb_build_object('ok', true, 'already', false);
end $$;

-- Guest asks for the bill: saves how they want to split, tip and pay, and calls a waiter.
create or replace function public.guest_bill(p_token text, p_split int, p_tip_pct numeric, p_pay text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; tips int[];
begin
  t := public.table_by_token(p_token);
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill') for update;
  if not found then raise exception 'There''s no open bill for this table.'; end if;
  if not exists (select 1 from public.orders where visit_id = v.id and status <> 'cancelled') then raise exception 'Nothing has been ordered yet.'; end if;
  select tip_options into tips from public.settings where id = 1;
  if coalesce(p_tip_pct, 0) <> 0 and not (p_tip_pct::int = any (tips)) then raise exception 'Pick one of the tip options.'; end if;
  if coalesce(p_pay, '') not in ('', 'upi', 'cash', 'card') then raise exception 'Pick how you''d like to pay.'; end if;
  update public.visits set status = 'bill', bill_at = coalesce(bill_at, now()),
         split = greatest(1, least(coalesce(p_split, 1), 20)), tip_pct = coalesce(p_tip_pct, 0), pay_choice = coalesce(p_pay, '')
   where id = v.id;
  if not exists (select 1 from public.calls where table_id = t.id and kind = 'bill' and done_at is null) then
    insert into public.calls (table_id, visit_id, kind) values (t.id, v.id, 'bill');
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
  insert into public.reviews (visit_id, table_id, stars, comment) values (p_visit, t.id, p_stars, left(coalesce(p_comment, ''), 600))
  on conflict (visit_id) do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- =============================================================================
-- STAFF functions (signed in)
-- =============================================================================
create or replace function public.staff_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'name', name, 'email', email, 'role', role, 'active', active)
    from public.staff where id = auth.uid();
$$;

-- Everything the live screens need, in one call (polled every few seconds).
create or replace function public.staff_live() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  perform public.need(public.is_staff());
  return jsonb_build_object('now', now(), 'role', public.my_role(),
    'settings', (select jsonb_build_object('name', restaurant_name, 'currency', currency, 'accepting', accepting_orders,
                   'gst_pct', gst_pct, 'service_pct', service_pct, 'upi_id', upi_id, 'upi_name', upi_name) from public.settings where id = 1),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'area', area, 'seats', seats, 'active', active)
                          order by sort, code) from public.dining_tables), '[]'),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table_id', v.table_id, 'status', v.status, 'opened_at', v.opened_at,
                          'bill_at', v.bill_at, 'guests', v.guests, 'split', v.split, 'tip_pct', v.tip_pct, 'pay_choice', v.pay_choice,
                          'bill', public.visit_bill(v.id),
                          'orders', coalesce((select jsonb_agg(public.order_json(o) order by o.created_at) from public.orders o where o.visit_id = v.id), '[]')))
                         from public.visits v where v.status in ('open', 'bill')), '[]'),
    'calls', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'table_id', c.table_id, 'kind', c.kind, 'at', c.created_at,
                          'seen_at', c.seen_at, 'seen_by', (select name from public.staff where id = c.seen_by)) order by c.created_at)
                         from public.calls c where c.done_at is null), '[]'),
    'today', jsonb_build_object(
       'sales', (select coalesce(sum(total), 0) from public.visits where status = 'paid' and paid_at >= day_start),
       'bills', (select count(*) from public.visits where status = 'paid' and paid_at >= day_start),
       'orders', (select count(*) from public.orders where created_at >= day_start and status <> 'cancelled'),
       'guests', (select coalesce(sum(coalesce(guests, 0)), 0) from public.visits where opened_at >= day_start and status <> 'void'),
       'rating', (select round(avg(stars), 1) from public.reviews where created_at >= day_start),
       'flow', (select coalesce(jsonb_object_agg(h, n), '{}') from (
                  select extract(hour from opened_at at time zone 'Asia/Kolkata')::int h, count(*) n
                    from public.visits where opened_at >= day_start and status <> 'void' group by 1) x)));
end $$;

create or replace function public.staff_order_status(p_order uuid, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r text := public.my_role();
begin
  perform public.need(r is not null);
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'That order is gone.'; end if;
  if p_status not in ('new', 'cooking', 'ready', 'served', 'cancelled') then raise exception 'Unknown status.'; end if;
  if p_status = 'cancelled' then
    perform public.need(r in ('owner', 'manager') or (r = 'waiter' and o.status = 'new'));
    if (select status from public.visits where id = o.visit_id) = 'paid' then raise exception 'This bill is already paid.'; end if;
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

create or replace function public.staff_add_order(p_table uuid, p_items jsonb, p_note text default '', p_guests int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  if not exists (select 1 from public.dining_tables where id = p_table) then raise exception 'Unknown table.'; end if;
  return public.add_order(p_table, p_items, p_note, p_guests, 'staff');
end $$;

create or replace function public.staff_call(p_call uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  if p_action = 'seen' then update public.calls set seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid()) where id = p_call;
  elsif p_action = 'done' then update public.calls set done_at = now(), seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid()) where id = p_call;
  else raise exception 'Unknown action.'; end if;
end $$;

create or replace function public.staff_visit_update(p_visit uuid, p_split int, p_tip_pct numeric, p_guests int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  update public.visits set split = greatest(1, least(coalesce(p_split, split), 20)), tip_pct = greatest(0, least(coalesce(p_tip_pct, tip_pct), 30)),
         guests = coalesce(case when p_guests between 1 and 40 then p_guests end, guests)
   where id = p_visit and status in ('open', 'bill');
  if not found then raise exception 'This table''s bill is already closed.'; end if;
  return public.visit_bill(p_visit);
end $$;

-- Marks the bill paid, frees the table, and closes the table's waiting calls.
create or replace function public.staff_mark_paid(p_visit uuid, p_method text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; v public.visits;
begin
  perform public.need(public.is_floor());
  if p_method not in ('upi', 'cash', 'card', 'mixed') then raise exception 'Pick how they paid.'; end if;
  select * into v from public.visits where id = p_visit for update;
  if not found or v.status not in ('open', 'bill') then raise exception 'This bill is already closed.'; end if;
  if exists (select 1 from public.orders where visit_id = p_visit and status in ('new', 'cooking')) then
    raise exception 'Some dishes are still with the kitchen. Serve or cancel them first.';
  end if;
  b := public.visit_bill(p_visit);
  update public.visits set status = 'paid', paid_at = now(), paid_method = p_method, paid_by = auth.uid(),
         subtotal = (b ->> 'subtotal')::numeric, service = (b ->> 'service')::numeric, gst = (b ->> 'gst')::numeric,
         tip = (b ->> 'tip')::numeric, total = (b ->> 'grand')::numeric
   where id = p_visit;
  update public.orders set status = 'served', served_at = coalesce(served_at, now()) where visit_id = p_visit and status = 'ready';
  update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  return public.visit_bill(p_visit);
end $$;

-- Clears a table without a payment (walk-out, test order, everything cancelled). Manager/owner only.
create or replace function public.staff_void_visit(p_visit uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.visits;
begin
  perform public.need(public.is_manager());
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a short reason.'; end if;
  update public.visits set status = 'void', void_reason = left(p_reason, 200) where id = p_visit and status in ('open', 'bill') returning * into v;
  if not found then raise exception 'This bill is already closed.'; end if;
  update public.orders set status = 'cancelled', cancel_reason = 'Table cleared' where visit_id = p_visit and status in ('new', 'cooking');
  update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  perform public.log_it('table_cleared', (select code from public.dining_tables where id = v.table_id) || ' · ' || p_reason);
end $$;

create or replace function public.staff_menu() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_staff());
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.sort, c.name) from public.categories c), '[]'),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort, i.name) from public.items i), '[]'));
end $$;

create or replace function public.staff_item_available(p_item uuid, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_staff());
  update public.items set available = p_available where id = p_item;
  perform public.log_it(case when p_available then 'back_on_menu' else 'sold_out' end, (select name from public.items where id = p_item));
end $$;

-- Paid bills in a date range (for the Bills screen)
create or replace function public.staff_bills(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table', t.code, 'opened_at', v.opened_at, 'paid_at', v.paid_at,
      'status', v.status, 'method', v.paid_method, 'total', v.total, 'tip', v.tip, 'guests', v.guests, 'void_reason', v.void_reason,
      'by', (select name from public.staff where id = v.paid_by), 'bill', public.visit_bill(v.id),
      'stars', (select stars from public.reviews where visit_id = v.id)) order by coalesce(v.paid_at, v.opened_at) desc)
    from public.visits v join public.dining_tables t on t.id = v.table_id
   where v.status in ('paid', 'void') and (coalesce(v.paid_at, v.opened_at) at time zone 'Asia/Kolkata')::date between p_from and p_to), '[]');
end $$;

-- =============================================================================
-- MANAGER / OWNER functions
-- =============================================================================
create or replace function public.owner_save_category(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.need(public.is_manager());
  if v_id is null then
    insert into public.categories (name, sort, active) values (trim(p ->> 'name'), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.categories)), coalesce((p ->> 'active')::boolean, true)) returning id into v_id;
  else
    update public.categories set name = trim(coalesce(p ->> 'name', name)), sort = coalesce((p ->> 'sort')::int, sort), active = coalesce((p ->> 'active')::boolean, active) where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.owner_delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  if exists (select 1 from public.items where category_id = p_id) then raise exception 'Move or delete the dishes in this section first.'; end if;
  delete from public.categories where id = p_id;
end $$;

create or replace function public.owner_save_item(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; sz jsonb := coalesce(p -> 'sizes', '[]'); ad jsonb := coalesce(p -> 'addons', '[]');
begin
  perform public.need(public.is_manager());
  if jsonb_typeof(sz) <> 'array' or jsonb_typeof(ad) <> 'array' then raise exception 'Sizes and extras must be lists.'; end if;
  if exists (select 1 from jsonb_array_elements(sz || ad) x where length(trim(coalesce(x ->> 'name', ''))) = 0 or (x ->> 'price') is null or (x ->> 'price')::numeric < 0) then
    raise exception 'Every size and extra needs a name and a price.';
  end if;
  if v_id is null then
    insert into public.items (category_id, name, description, price, diet, spice, allergens, sizes, addons, photo_url, bestseller, available, sort)
    values ((p ->> 'category_id')::uuid, trim(p ->> 'name'), coalesce(p ->> 'description', ''), coalesce((p ->> 'price')::numeric, 0),
            coalesce(p ->> 'diet', 'veg'), nullif(p ->> 'spice', '')::smallint,
            coalesce(array(select jsonb_array_elements_text(p -> 'allergens')), '{}'), sz, ad, coalesce(p ->> 'photo_url', ''),
            coalesce((p ->> 'bestseller')::boolean, false), coalesce((p ->> 'available')::boolean, true),
            coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.items)))
    returning id into v_id;
  else
    update public.items set category_id = (p ->> 'category_id')::uuid, name = trim(p ->> 'name'), description = coalesce(p ->> 'description', ''),
      price = coalesce((p ->> 'price')::numeric, 0), diet = coalesce(p ->> 'diet', 'veg'), spice = nullif(p ->> 'spice', '')::smallint,
      allergens = coalesce(array(select jsonb_array_elements_text(p -> 'allergens')), '{}'), sizes = sz, addons = ad,
      photo_url = coalesce(p ->> 'photo_url', ''), bestseller = coalesce((p ->> 'bestseller')::boolean, false),
      available = coalesce((p ->> 'available')::boolean, true), sort = coalesce((p ->> 'sort')::int, sort)
     where id = v_id;
    if not found then raise exception 'That dish is gone.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.owner_delete_item(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  perform public.need(public.is_manager());
  delete from public.items where id = p_id returning photo_url into ph;
  perform public.log_it('dish_deleted', '');
  return ph;   -- the app removes the photo file
end $$;

create or replace function public.owner_save_table(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform public.need(public.is_manager());
  if v_id is null then
    insert into public.dining_tables (code, name, area, seats, sort, active)
    values (upper(trim(p ->> 'code')), coalesce(p ->> 'name', ''), coalesce(nullif(trim(p ->> 'area'), ''), 'Main'),
            coalesce((p ->> 'seats')::int, 4), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.dining_tables)),
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update public.dining_tables set code = upper(trim(p ->> 'code')), name = coalesce(p ->> 'name', ''), area = coalesce(nullif(trim(p ->> 'area'), ''), 'Main'),
      seats = coalesce((p ->> 'seats')::int, seats), sort = coalesce((p ->> 'sort')::int, sort), active = coalesce((p ->> 'active')::boolean, active)
     where id = v_id;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Another table already uses that number.';
end $$;

create or replace function public.owner_delete_table(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  if exists (select 1 from public.visits where table_id = p_id) then raise exception 'This table has bills on record. Switch it off instead.'; end if;
  delete from public.dining_tables where id = p_id;
end $$;

-- QR codes need the secret token; only managers can see them.
create or replace function public.owner_table_tokens() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  return coalesce((select jsonb_object_agg(id, token) from public.dining_tables), '{}');
end $$;

create or replace function public.owner_new_token(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  perform public.need(public.is_manager());
  update public.dining_tables set token = encode(gen_random_bytes(9), 'hex') where id = p_id returning token into t;
  perform public.log_it('qr_replaced', (select code from public.dining_tables where id = p_id));
  return t;
end $$;

create or replace function public.owner_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_staff());
  return (select to_jsonb(s) - 'id' from public.settings s where id = 1);
end $$;

create or replace function public.owner_save_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Managers may only switch ordering on/off; everything else is owner-only.
  perform public.need(public.is_manager());
  if not public.is_owner() and exists (select 1 from jsonb_object_keys(p) k where k <> 'accepting_orders') then
    raise exception 'Only the owner can change settings.' using errcode = '42501';
  end if;
  update public.settings set
    restaurant_name   = coalesce(nullif(trim(p ->> 'restaurant_name'), ''), restaurant_name),
    tagline           = coalesce(p ->> 'tagline', tagline),
    currency          = coalesce(nullif(p ->> 'currency', ''), currency),
    accent            = coalesce(nullif(p ->> 'accent', ''), accent),
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
  if p ? 'restaurant_name' or p ? 'upi_id' or p ? 'gst_pct' then perform public.log_it('settings_changed', ''); end if;
end $$;

-- Numbers for the Dashboard / Reports screen
create or replace function public.owner_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text := 'Asia/Kolkata';
begin
  perform public.need(public.is_manager());
  return jsonb_build_object(
    'sales',   (select coalesce(sum(total), 0) from public.visits where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'tips',    (select coalesce(sum(tip), 0) from public.visits where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'gst',     (select coalesce(sum(gst), 0) from public.visits where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'bills',   (select count(*) from public.visits where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'guests',  (select coalesce(sum(guests), 0) from public.visits where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'voids',   (select count(*) from public.visits where status = 'void' and (opened_at at time zone tz)::date between p_from and p_to),
    'by_day',  (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'sales', s, 'bills', n) order by d), '[]') from (
                  select (paid_at at time zone tz)::date d, sum(total) s, count(*) n from public.visits
                   where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to group by 1) x),
    'by_hour', (select coalesce(jsonb_object_agg(h, n), '{}') from (
                  select extract(hour from opened_at at time zone tz)::int h, count(*) n from public.visits
                   where status = 'paid' and (opened_at at time zone tz)::date between p_from and p_to group by 1) x),
    'methods', (select coalesce(jsonb_object_agg(paid_method, s), '{}') from (
                  select paid_method, sum(total) s from public.visits
                   where status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to group by 1) x),
    'top',     (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'amount', a) order by q desc, a desc), '[]') from (
                  select oi.name, sum(oi.qty) q, sum(oi.line_total) a from public.order_items oi
                    join public.orders o on o.id = oi.order_id join public.visits v on v.id = o.visit_id
                   where v.status = 'paid' and o.status <> 'cancelled' and (v.paid_at at time zone tz)::date between p_from and p_to
                   group by oi.name order by 2 desc limit 10) x),
    'prep_mins', (select round(avg(extract(epoch from ready_at - created_at)) / 60, 1) from public.orders
                   where ready_at is not null and (created_at at time zone tz)::date between p_from and p_to),
    'rating',  (select round(avg(stars), 2) from public.reviews where (created_at at time zone tz)::date between p_from and p_to),
    'ratings', (select count(*) from public.reviews where (created_at at time zone tz)::date between p_from and p_to),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('stars', r.stars, 'comment', r.comment, 'at', r.created_at,
                    'table', (select code from public.dining_tables where id = r.table_id)) order by r.created_at desc), '[]')
                  from (select * from public.reviews where (created_at at time zone tz)::date between p_from and p_to order by created_at desc limit 50) r));
end $$;

-- Team (logins are added/removed by the team-admin edge function, which calls these as the owner)
create or replace function public.owner_team() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  return jsonb_build_object('staff', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'email', email, 'phone', phone,
    'role', role, 'active', active, 'created_at', created_at) order by created_at) from public.staff), '[]'));
end $$;

create or replace function public.owner_edit_staff(p_id uuid, p_name text, p_phone text, p_role text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  if p_role not in ('owner', 'manager', 'waiter', 'kitchen') then raise exception 'Unknown role.'; end if;
  if p_id = auth.uid() and (p_role <> 'owner' or p_active = false) then raise exception 'You can''t remove your own owner access.'; end if;
  update public.staff set name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone), role = p_role,
         active = coalesce(p_active, active) where id = p_id;
  perform public.log_it('login_changed', coalesce(p_name, '') || ' (' || p_role || ')');
end $$;

create or replace function public.owner_prepare_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  if p_id = auth.uid() then raise exception 'You can''t delete your own login.'; end if;
  update public.staff set active = false where id = p_id;
  perform public.log_it('login_deleted', (select name from public.staff where id = p_id));
end $$;

create or replace function public.owner_log(p_action text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.need(public.is_owner()); perform public.log_it(p_action, p_detail); end $$;

create or replace function public.owner_activity(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from (select * from public.activity_log order by at desc limit least(p_limit, 500)) a), '[]');
end $$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.guest_menu(text), public.guest_state(text), public.guest_order(text, jsonb, text, int),
  public.guest_call(text, text), public.guest_bill(text, int, numeric, text), public.guest_review(text, uuid, int, text)
  to anon, authenticated;
grant execute on function public.staff_me(), public.staff_live(), public.staff_order_status(uuid, text, text),
  public.staff_add_order(uuid, jsonb, text, int), public.staff_call(uuid, text), public.staff_visit_update(uuid, int, numeric, int),
  public.staff_mark_paid(uuid, text), public.staff_void_visit(uuid, text), public.staff_menu(), public.staff_item_available(uuid, boolean),
  public.staff_bills(date, date),
  public.owner_save_category(jsonb), public.owner_delete_category(uuid), public.owner_save_item(jsonb), public.owner_delete_item(uuid),
  public.owner_save_table(jsonb), public.owner_delete_table(uuid), public.owner_table_tokens(), public.owner_new_token(uuid),
  public.owner_settings(), public.owner_save_settings(jsonb), public.owner_report(date, date),
  public.owner_team(), public.owner_edit_staff(uuid, text, text, text, boolean), public.owner_prepare_delete(uuid),
  public.owner_log(text, text), public.owner_activity(int),
  public.is_staff(), public.is_manager(), public.is_owner()
  to authenticated;

-- -----------------------------------------------------------------------------
-- Dish photos: public bucket (anyone can view a photo), only managers upload/delete.
-- Skipped automatically when Storage isn't there (local tests).
-- -----------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu-photos', 'menu-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy "menu photos upload" on storage.objects for insert to authenticated
             with check (bucket_id = 'menu-photos' and public.is_manager())$p$;
    execute $p$create policy "menu photos change" on storage.objects for update to authenticated
             using (bucket_id = 'menu-photos' and public.is_manager())$p$;
    execute $p$create policy "menu photos delete" on storage.objects for delete to authenticated
             using (bucket_id = 'menu-photos' and public.is_manager())$p$;
  end if;
end $$;
