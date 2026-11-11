-- =============================================================================
-- 0005 · POS, kitchen and closing the day (DineOS). Run after 0001–0004.
--
-- What changes
-- * Discounts: a manager or owner can take a % or a fixed amount off a bill, with a reason.
--   Managers are limited to settings.max_discount_pct; the owner isn't. Every change is logged.
-- * Takeaway: an order without a table gets a token number (starts at 1 every day).
-- * Split payments: one bill can be paid by several methods; each part is its own payments row.
-- * Kitchen stations: settings.stations (Tandoor, Curry, Bar…); a section or a dish picks one;
--   each dish ordered remembers its station. Dishes can be ticked off one by one; when every
--   dish of an order is done, the order is Ready.
-- * Close the day: cash count (opening + cash taken − paid out = expected, against counted),
--   saved in day_closes. A closed day takes no more orders or payments until the owner reopens it.
-- * Team notice: a short message from a manager or the owner, shown on every staff screen.
--
-- Money order (visit_bill): subtotal → minus discount → service % → GST % on (net + service)
-- → round to the rupee → tip % on the net. Without a discount nothing changes.
-- Nothing is deleted; existing functions keep their names and inputs.
-- =============================================================================

-- Locked by default (0003): nothing new is runnable until granted below.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
alter table public.settings
  add column if not exists max_discount_pct numeric(5,2) not null default 20 check (max_discount_pct between 0 and 100),
  add column if not exists stations        text[] not null default '{}',
  add column if not exists team_notice     text not null default '' check (length(team_notice) <= 300),
  add column if not exists team_notice_at  timestamptz,
  add column if not exists team_notice_by  text not null default '';

alter table public.restaurants
  add column if not exists last_token_no int not null default 0,
  add column if not exists token_day     date;

alter table public.visits
  add column if not exists kind            text not null default 'dine_in' check (kind in ('dine_in', 'takeaway')),
  add column if not exists token_no        int,
  add column if not exists discount_kind   text check (discount_kind in ('pct', 'amount')),
  add column if not exists discount_value  numeric(10,2) not null default 0 check (discount_value >= 0),
  add column if not exists discount_reason text not null default '' check (length(discount_reason) <= 200),
  add column if not exists discount_by     uuid,
  add column if not exists discount        numeric(10,2) not null default 0;   -- frozen when paid
alter table public.visits alter column table_id drop not null;
alter table public.visits add constraint visits_kind_table check ((kind = 'takeaway') = (table_id is null));

alter table public.orders alter column table_id drop not null;

alter table public.categories add column if not exists station text not null default '';
alter table public.items      add column if not exists station text not null default '';   -- '' = the section's station
alter table public.order_items
  add column if not exists station text not null default '',
  add column if not exists done_at timestamptz;

create table public.day_closes (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  day            date not null,
  opening_cash   numeric(10,2) not null default 0 check (opening_cash >= 0),
  cash_sales     numeric(10,2) not null default 0,
  upi_sales      numeric(10,2) not null default 0,
  card_sales     numeric(10,2) not null default 0,
  sales          numeric(10,2) not null default 0,
  bills          int not null default 0,
  discounts      numeric(10,2) not null default 0,
  tips           numeric(10,2) not null default 0,
  paid_out       numeric(10,2) not null default 0 check (paid_out >= 0),
  expected       numeric(10,2) not null,
  counted        numeric(10,2) not null check (counted >= 0),
  difference     numeric(10,2) not null,
  note           text not null default '' check (length(note) <= 300),
  closed_by      uuid,
  closed_by_name text not null default '',
  closed_at      timestamptz not null default now(),
  unique (restaurant_id, day)
);
alter table public.day_closes enable row level security;
revoke all on public.day_closes from anon, authenticated;

-- -----------------------------------------------------------------------------
-- restaurant_id trigger: takeaway visits have no table; an order's table must be its visit's
-- -----------------------------------------------------------------------------
create or replace function public.set_restaurant_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if tg_op = 'UPDATE' and new.restaurant_id is distinct from old.restaurant_id then
    raise exception 'Rows can''t move between restaurants.';
  end if;
  case tg_table_name
    when 'items'               then select restaurant_id into p from public.categories where id = new.category_id;
    when 'visits'              then if new.table_id is null then p := coalesce(new.restaurant_id, public.my_restaurant(), public.only_restaurant());
                                    else select restaurant_id into p from public.dining_tables where id = new.table_id; end if;
    when 'calls'               then select restaurant_id into p from public.dining_tables where id = new.table_id;
    when 'orders'              then select restaurant_id into p from public.visits where id = new.visit_id;
    when 'order_items'         then select restaurant_id into p from public.orders where id = new.order_id;
    when 'reviews', 'payments' then select restaurant_id into p from public.visits where id = new.visit_id;
    else p := coalesce(new.restaurant_id, public.my_restaurant(), public.only_restaurant());   -- categories, dining_tables, activity_log, day_closes
  end case;
  if p is null then raise exception 'No restaurant is selected.'; end if;
  if new.restaurant_id is null then new.restaurant_id := p;
  elsif new.restaurant_id <> p then raise exception 'That belongs to another restaurant.';
  end if;
  if tg_table_name = 'orders' then
    if new.table_id is not null and not exists (select 1 from public.dining_tables where id = new.table_id and restaurant_id = p) then
      raise exception 'That belongs to another restaurant.';
    end if;
    if new.table_id is distinct from (select table_id from public.visits where id = new.visit_id) then
      raise exception 'That order belongs to another table.';
    end if;
    if tg_op = 'INSERT' then   -- order numbers count per restaurant
      update public.restaurants set last_order_no = last_order_no + 1 where id = p returning last_order_no into new.no;
    end if;
  end if;
  return new;
end $$;
create trigger a_restaurant_id before insert or update on public.day_closes for each row execute function public.set_restaurant_id();

-- Shown wherever a bill is named: the table number, or the takeaway token
create or replace function public.visit_label(v public.visits) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select code from public.dining_tables where id = v.table_id), 'Token ' || v.token_no, '');
$$;

create or replace function public.audit_visits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.status not in ('open', 'bill') then return null; end if;
  if old.split is distinct from new.split or old.tip_pct is distinct from new.tip_pct then
    perform public.log_at(new.restaurant_id, 'bill_changed', public.visit_label(new) || ' · split ' || old.split || '→' || new.split
                          || ' · tip ' || old.tip_pct || '%→' || new.tip_pct || '%');
  end if;
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Small helpers (not callable from the app)
-- -----------------------------------------------------------------------------
create or replace function public.ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.day_closed(p_restaurant uuid, p_day date default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.day_closes where restaurant_id = p_restaurant and day = coalesce(p_day, public.ist_today()));
$$;

-- Takeaway tokens: 1, 2, 3… starting again every day
create or replace function public.next_token(p_restaurant uuid) returns int
language sql security definer set search_path = public as $$
  update public.restaurants
     set last_token_no = case when token_day = public.ist_today() then last_token_no + 1 else 1 end, token_day = public.ist_today()
   where id = p_restaurant returning last_token_no;
$$;

create or replace function public.station_ok(p_restaurant uuid, p_station text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_station, '') = '' or p_station = any (select unnest(stations) from public.settings where restaurant_id = p_restaurant);
$$;

-- -----------------------------------------------------------------------------
-- Orders: dishes remember their station; tickets show each dish's id, station and done
-- -----------------------------------------------------------------------------
create or replace function public.order_json(o public.orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'no', o.no, 'status', o.status, 'source', o.source, 'note', o.note,
    'created_at', o.created_at, 'started_at', o.started_at, 'ready_at', o.ready_at, 'served_at', o.served_at,
    'cancel_reason', o.cancel_reason,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'size', size, 'addons', addons, 'qty', qty,
                         'diet', diet, 'note', note, 'amount', line_total, 'station', station, 'done', done_at is not null) order by id)
                       from public.order_items where order_id = o.id), '[]'));
$$;

create or replace function public.price_cart(p_items jsonb, p_restaurant uuid) returns jsonb
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
      select i.*, c.active as cat_active, c.station as cat_station into m
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
      'diet', m.diet, 'qty', v_qty, 'unit_price', v_unit, 'line_total', v_unit * v_qty, 'note', left(coalesce(it ->> 'note', ''), 200),
      'station', coalesce(nullif(m.station, ''), m.cat_station, ''));
  end loop;
  if v_count > 60 then raise exception 'That''s a lot of dishes. Please ask a waiter.'; end if;
  return out_lines;
end $$;

create or replace function public.insert_order_items(p_order uuid, p_restaurant uuid, p_lines jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.order_items (restaurant_id, order_id, item_id, name, size, addons, diet, qty, unit_price, line_total, note, station)
  select p_restaurant, p_order, (l ->> 'item_id')::uuid, l ->> 'name', l ->> 'size', array(select jsonb_array_elements_text(l -> 'addons')),
         l ->> 'diet', (l ->> 'qty')::int, (l ->> 'unit_price')::numeric, (l ->> 'line_total')::numeric, l ->> 'note', coalesce(l ->> 'station', '')
    from jsonb_array_elements(p_lines) with ordinality as x(l, n) order by n;
$$;

create or replace function public.add_order(p_table uuid, p_items jsonb, p_note text, p_guests int, p_source text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits; o public.orders; lines jsonb; rid uuid;
begin
  select restaurant_id into rid from public.dining_tables where id = p_table;
  if rid is null then raise exception 'Unknown table.'; end if;
  if p_request is not null then
    select * into o from public.orders where request_id = p_request;
    if found then
      if o.table_id is distinct from p_table then raise exception 'That order belongs to another table.'; end if;
      return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true);
    end if;
  end if;
  if public.day_closed(rid) then
    if p_source = 'guest' then raise exception '%', (select closed_message from public.settings where restaurant_id = rid); end if;
    raise exception 'Today has been closed. Ask the owner to reopen it to take more orders.';
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
  perform public.insert_order_items(o.id, rid, lines);
  return jsonb_build_object('order', public.order_json(o), 'visit_id', v.id);
exception when unique_violation then
  select * into o from public.orders where request_id = p_request;
  if found then return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true); end if;
  raise;
end $$;

-- Takeaway: a new token when p_visit is empty, otherwise more dishes on that token
create or replace function public.staff_takeaway_order(p_visit uuid, p_items jsonb, p_note text default '', p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant(); v public.visits; o public.orders; lines jsonb;
begin
  perform public.need(public.is_floor());
  if p_request_id is not null then
    select * into o from public.orders where request_id = p_request_id;
    if found then
      if o.restaurant_id <> rid or o.table_id is not null then raise exception 'That order belongs to another table.'; end if;
      return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'token', (select token_no from public.visits where id = o.visit_id), 'repeat', true);
    end if;
  end if;
  if public.day_closed(rid) then raise exception 'Today has been closed. Ask the owner to reopen it to take more orders.'; end if;
  lines := public.price_cart(p_items, rid);
  if p_visit is null then
    insert into public.visits (restaurant_id, kind, token_no) values (rid, 'takeaway', public.next_token(rid)) returning * into v;
  else
    select * into v from public.visits where id = p_visit and restaurant_id = rid and kind = 'takeaway' and status in ('open', 'bill') for update;
    if not found then raise exception 'This takeaway is already closed.'; end if;
    update public.visits set status = 'open' where id = v.id returning * into v;
  end if;
  insert into public.orders (restaurant_id, visit_id, table_id, source, created_by, note, request_id)
  values (rid, v.id, null, 'staff', auth.uid(), left(coalesce(p_note, ''), 300), p_request_id) returning * into o;
  perform public.insert_order_items(o.id, rid, lines);
  return jsonb_build_object('order', public.order_json(o), 'visit_id', v.id, 'token', v.token_no);
exception when unique_violation then
  select * into o from public.orders where request_id = p_request_id;
  if found then return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true); end if;
  raise;
end $$;

-- -----------------------------------------------------------------------------
-- The bill, with the discount
-- -----------------------------------------------------------------------------
create or replace function public.visit_bill(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v record; s record; sub numeric; disc numeric; net numeric; svc numeric; tax numeric; tot numeric; tp numeric; lines jsonb; pays jsonb;
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
    select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount, 'reference', reference) order by created_at), '[]')
      into pays from public.payments where visit_id = p_visit;
    return jsonb_build_object('lines', lines, 'subtotal', v.subtotal, 'discount', v.discount, 'discount_kind', v.discount_kind,
      'discount_value', v.discount_value, 'discount_reason', v.discount_reason, 'service', v.service, 'gst', v.gst, 'tip', v.tip,
      'total', v.total - v.tip, 'grand', v.total, 'split', v.split, 'each', ceil(v.total / v.split), 'tip_pct', v.tip_pct,
      'service_pct', s.service_pct, 'gst_pct', s.gst_pct, 'payments', pays);
  end if;
  disc := case v.discount_kind when 'pct' then round(sub * v.discount_value / 100, 2) when 'amount' then least(v.discount_value, sub) else 0 end;
  net := sub - disc;
  svc := round(net * s.service_pct / 100, 2);
  tax := round((net + svc) * s.gst_pct / 100, 2);
  tot := round(net + svc + tax);
  tp  := round(net * v.tip_pct / 100);
  return jsonb_build_object('lines', lines, 'subtotal', sub, 'discount', disc, 'discount_kind', v.discount_kind,
    'discount_value', v.discount_value, 'discount_reason', v.discount_reason, 'service', svc, 'gst', tax, 'tip', tp, 'total', tot,
    'grand', tot + tp, 'split', v.split, 'each', ceil((tot + tp) / v.split), 'tip_pct', v.tip_pct,
    'service_pct', s.service_pct, 'gst_pct', s.gst_pct);
end $$;

create or replace function public.staff_set_discount(p_visit uuid, p_kind text, p_value numeric, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits; sub numeric; disc numeric; lim numeric;
begin
  perform public.need(public.is_manager());
  select * into v from public.visits where id = p_visit and restaurant_id = public.my_restaurant() and status in ('open', 'bill') for update;
  if not found then raise exception 'This bill is already closed.'; end if;
  if coalesce(p_kind, 'none') = 'none' or coalesce(p_value, 0) = 0 then
    update public.visits set discount_kind = null, discount_value = 0, discount_reason = '', discount_by = null where id = v.id;
    if v.discount_kind is not null then perform public.log_it('discount_removed', public.visit_label(v)); end if;
    return public.visit_bill(v.id);
  end if;
  if p_kind not in ('pct', 'amount') then raise exception 'Pick percent or amount.'; end if;
  if p_value < 0 or (p_kind = 'pct' and p_value > 100) then raise exception 'Check the discount.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a short reason for the discount.'; end if;
  sub := (public.visit_bill(v.id) ->> 'subtotal')::numeric;
  disc := case p_kind when 'pct' then round(sub * p_value / 100, 2) else least(p_value, sub) end;
  if not public.is_owner() then
    select max_discount_pct into lim from public.settings where restaurant_id = v.restaurant_id;
    if (p_kind = 'pct' and p_value > lim) or (p_kind = 'amount' and disc > round(sub * lim / 100, 2)) then
      raise exception 'Managers can take up to % off a bill. Ask the owner for more.', trim(to_char(lim, 'FM990.##')) || '%';
    end if;
  end if;
  update public.visits set discount_kind = p_kind, discount_value = round(p_value, 2), discount_reason = left(trim(p_reason), 200), discount_by = auth.uid()
   where id = v.id;
  perform public.log_it('discount', public.visit_label(v) || ' · ₹' || disc || case when p_kind = 'pct' then ' (' || trim(to_char(p_value, 'FM990.##')) || '%)' else '' end
                         || ' · ' || trim(p_reason));
  return public.visit_bill(v.id);
end $$;

-- -----------------------------------------------------------------------------
-- Payments: one or more parts; each part is a payments row
-- -----------------------------------------------------------------------------
create or replace function public.pay_visit(p_visit uuid, p_parts jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; v public.visits; p jsonb; n int; tot numeric := 0; methods text[] := '{}'; m text; amt numeric; ref text;
        grand numeric; detail text := ''; refs text := '';
begin
  perform public.need(public.is_floor());
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' then raise exception 'Add how they paid.'; end if;
  n := jsonb_array_length(p_parts);
  if n not between 1 and 6 then raise exception 'Use up to 6 payments on one bill.'; end if;
  select * into v from public.visits where id = p_visit and restaurant_id = public.my_restaurant() for update;
  if not found or v.status not in ('open', 'bill') then raise exception 'This bill is already closed.'; end if;
  if public.day_closed(v.restaurant_id) then raise exception 'Today has been closed. Ask the owner to reopen it to take payments.'; end if;
  if v.kind = 'dine_in' and exists (select 1 from public.orders where visit_id = p_visit and status in ('new', 'cooking')) then
    raise exception 'Some dishes are still with the kitchen. Serve or cancel them first.';
  end if;
  b := public.visit_bill(p_visit); grand := (b ->> 'grand')::numeric;
  for p in select * from jsonb_array_elements(p_parts) loop
    m := p ->> 'method';
    if m is null or not (m in ('upi', 'cash', 'card') or (m = 'mixed' and n = 1)) then raise exception 'Pick how they paid.'; end if;
    begin amt := round((p ->> 'amount')::numeric, 2);
    exception when others then raise exception 'Check the amounts.'; end;
    if amt is null or amt < 0 or (amt = 0 and n > 1) then raise exception 'Check the amounts.'; end if;
    ref := trim(coalesce(p ->> 'reference', ''));
    if length(ref) > 60 then raise exception 'The reference is too long.'; end if;
    tot := tot + amt;
    if not m = any (methods) then methods := methods || m; end if;
    detail := detail || case when detail = '' then '' else ' + ' end || upper(m) || case when n > 1 then ' ₹' || amt else '' end;
    if ref <> '' then refs := refs || ' · ref ' || ref; end if;
  end loop;
  if tot <> grand then raise exception 'The payments add up to ₹% but the bill is ₹%.', tot, grand; end if;
  update public.visits set status = 'paid', paid_at = now(), paid_by = auth.uid(),
         paid_method = case when array_length(methods, 1) = 1 then methods[1] else 'mixed' end,
         subtotal = (b ->> 'subtotal')::numeric, discount = (b ->> 'discount')::numeric, service = (b ->> 'service')::numeric,
         gst = (b ->> 'gst')::numeric, tip = (b ->> 'tip')::numeric, total = grand
   where id = p_visit;
  insert into public.payments (restaurant_id, visit_id, method, amount, reference, created_by)
  select v.restaurant_id, p_visit, x ->> 'method', round((x ->> 'amount')::numeric, 2), trim(coalesce(x ->> 'reference', '')), auth.uid()
    from jsonb_array_elements(p_parts) with ordinality as t(x, i) order by i;
  if v.kind = 'dine_in' then   -- takeaway is often paid first; the counter hands it over later
    update public.orders set status = 'served', served_at = coalesce(served_at, now()) where visit_id = p_visit and status = 'ready';
    update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  end if;
  perform public.log_it('bill_paid', public.visit_label(v) || ' · ' || detail || ' · ₹' || grand || refs);
  return public.visit_bill(p_visit);
end $$;

create or replace function public.staff_pay(p_visit uuid, p_parts jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin return public.pay_visit(p_visit, p_parts); end $$;

-- Same as before: one payment for the whole bill
create or replace function public.staff_mark_paid(p_visit uuid, p_method text, p_reference text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare g numeric;
begin
  perform public.need(public.is_floor());
  if p_method not in ('upi', 'cash', 'card', 'mixed') then raise exception 'Pick how they paid.'; end if;
  if not exists (select 1 from public.visits where id = p_visit and restaurant_id = public.my_restaurant() and status in ('open', 'bill')) then
    raise exception 'This bill is already closed.';
  end if;
  g := (public.visit_bill(p_visit) ->> 'grand')::numeric;
  return public.pay_visit(p_visit, jsonb_build_array(jsonb_build_object('method', p_method, 'amount', g, 'reference', coalesce(p_reference, ''))));
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
  if v.table_id is not null then update public.calls set done_at = now() where table_id = v.table_id and done_at is null; end if;
  perform public.log_it('table_cleared', public.visit_label(v) || ' · ' || p_reason);
end $$;

-- -----------------------------------------------------------------------------
-- Kitchen: order steps (paid takeaway can still be cooked and handed over) and dish ticks
-- -----------------------------------------------------------------------------
create or replace function public.order_open(o public.orders, p_cancel boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select v.status in ('open', 'bill') or (v.status = 'paid' and v.kind = 'takeaway' and not p_cancel)
    from public.visits v where v.id = o.visit_id;
$$;

create or replace function public.staff_order_status(p_order uuid, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r text := public.my_role(); was text;
begin
  perform public.need(r is not null);
  select * into o from public.orders where id = p_order and restaurant_id = public.my_restaurant() for update;
  if not found then raise exception 'That order is gone.'; end if;
  if p_status not in ('new', 'cooking', 'ready', 'served', 'cancelled') then raise exception 'Unknown status.'; end if;
  if not public.order_open(o, p_status = 'cancelled') then raise exception 'This bill is already closed, so its orders can''t change.'; end if;
  if o.status = p_status then return public.order_json(o); end if;
  if not public.order_step_ok(o.status, p_status) then
    raise exception 'This order is % and can''t go to % from there. Refresh the screen.', o.status, p_status;
  end if;
  if p_status = 'cancelled' then
    perform public.need(r in ('owner', 'manager') or (r = 'waiter' and o.status = 'new'));
  end if;
  was := o.status;
  update public.orders set status = p_status,
    started_at = case when p_status = 'new' then null else coalesce(started_at, case when p_status <> 'cancelled' then now() end) end,
    ready_at   = case when p_status in ('new', 'cooking') then null when p_status in ('ready', 'served') then coalesce(ready_at, now()) else ready_at end,
    served_at  = case when p_status = 'served' then coalesce(served_at, now()) when p_status = 'cancelled' then served_at else null end,
    cancel_reason = case when p_status = 'cancelled' then left(coalesce(p_reason, ''), 200) else '' end
   where id = p_order returning * into o;
  -- dish ticks follow the order: ready means every dish is done; going back un-ticks them
  if p_status in ('ready', 'served') then
    update public.order_items set done_at = coalesce(done_at, now()) where order_id = p_order;
  elsif p_status = 'new' or (p_status = 'cooking' and was in ('ready', 'served')) then
    update public.order_items set done_at = null where order_id = p_order;
  end if;
  if p_status = 'cancelled' then perform public.log_it('order_cancelled', '#' || o.no || coalesce(' · ' || nullif(p_reason, ''), '')); end if;
  return public.order_json(o);
end $$;

create or replace function public.staff_item_done(p_item bigint, p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid uuid; o public.orders;
begin
  perform public.need(public.is_staff());
  select order_id into oid from public.order_items where id = p_item and restaurant_id = public.my_restaurant();
  if oid is null then raise exception 'That dish is gone.'; end if;
  select * into o from public.orders where id = oid for update;
  if not public.order_open(o, false) then raise exception 'This bill is already closed, so its orders can''t change.'; end if;
  if o.status not in ('new', 'cooking', 'ready') then raise exception 'This order is % so its dishes can''t change. Refresh the screen.', o.status; end if;
  update public.order_items set done_at = case when p_done then coalesce(done_at, now()) end where id = p_item;
  if p_done then
    if o.status = 'new' then
      update public.orders set status = 'cooking', started_at = coalesce(started_at, now()) where id = oid;
    end if;
    if not exists (select 1 from public.order_items where order_id = oid and done_at is null) then
      update public.orders set status = 'ready', ready_at = coalesce(ready_at, now()) where id = oid;
    end if;
  elsif o.status = 'ready' then
    update public.orders set status = 'cooking', ready_at = null where id = oid;
  end if;
  select * into o from public.orders where id = oid;
  return public.order_json(o);
end $$;

-- -----------------------------------------------------------------------------
-- The live screen: takeaway tokens, discounts, stations, notice, closed day
-- -----------------------------------------------------------------------------
create or replace function public.staff_live() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
        rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_staff());
  return jsonb_build_object('now', now(), 'role', public.my_role(), 'restaurant_id', rid,
    'settings', (select jsonb_build_object('name', restaurant_name, 'currency', currency, 'accepting', accepting_orders,
                   'gst_pct', gst_pct, 'service_pct', service_pct, 'upi_id', upi_id, 'upi_name', upi_name,
                   'stations', to_jsonb(stations), 'max_discount_pct', max_discount_pct,
                   'notice', case when team_notice <> '' then jsonb_build_object('text', team_notice, 'at', team_notice_at, 'by', team_notice_by) end,
                   'day_closed', public.day_closed(rid))
                   from public.settings where restaurant_id = rid),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'area', area, 'seats', seats, 'active', active)
                          order by sort, code) from public.dining_tables where restaurant_id = rid), '[]'),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table_id', v.table_id, 'kind', v.kind, 'token', v.token_no,
                          'status', v.status, 'opened_at', v.opened_at,
                          'bill_at', v.bill_at, 'guests', v.guests, 'split', v.split, 'tip_pct', v.tip_pct, 'pay_choice', v.pay_choice,
                          'bill', public.visit_bill(v.id),
                          'orders', coalesce((select jsonb_agg(public.order_json(o) order by o.created_at) from public.orders o where o.visit_id = v.id), '[]'))
                          order by v.opened_at)
                         from public.visits v where v.restaurant_id = rid
                          and (v.status in ('open', 'bill')
                               or (v.kind = 'takeaway' and v.status = 'paid'
                                   and exists (select 1 from public.orders o where o.visit_id = v.id and o.status in ('new', 'cooking', 'ready'))))), '[]'),
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

create or replace function public.staff_bills(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_floor());
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table', public.visit_label(v), 'kind', v.kind, 'opened_at', v.opened_at, 'paid_at', v.paid_at,
      'status', v.status, 'method', v.paid_method, 'total', v.total, 'tip', v.tip, 'discount', v.discount, 'guests', v.guests, 'void_reason', v.void_reason,
      'by', (select name from public.memberships where user_id = v.paid_by and restaurant_id = rid), 'bill', public.visit_bill(v.id),
      'ref', (select string_agg(nullif(p.reference, ''), ', ') from public.payments p where p.visit_id = v.id),
      'stars', (select stars from public.reviews where visit_id = v.id)) order by coalesce(v.paid_at, v.opened_at) desc)
    from public.visits v
   where v.restaurant_id = rid and v.status in ('paid', 'void')
     and (coalesce(v.paid_at, v.opened_at) at time zone 'Asia/Kolkata')::date between p_from and p_to), '[]');
end $$;

-- -----------------------------------------------------------------------------
-- Team notice
-- -----------------------------------------------------------------------------
create or replace function public.staff_set_notice(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_text, '')); rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  if length(t) > 300 then raise exception 'Keep the notice under 300 characters.'; end if;
  update public.settings set team_notice = t, team_notice_at = case when t = '' then null else now() end,
         team_notice_by = case when t = '' then '' else coalesce((select nullif(name, '') from public.memberships where user_id = auth.uid() and restaurant_id = rid), '') end
   where restaurant_id = rid;
  perform public.log_it(case when t = '' then 'notice_cleared' else 'notice_changed' end, left(t, 120));
end $$;

-- -----------------------------------------------------------------------------
-- Close the day
-- -----------------------------------------------------------------------------
create or replace function public.staff_day_summary(p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := public.my_restaurant(); d date := coalesce(p_day, public.ist_today()); tz text := 'Asia/Kolkata';
begin
  perform public.need(public.is_manager());
  return jsonb_build_object('day', d, 'today', public.ist_today(),
    'closed', (select to_jsonb(c) - 'restaurant_id' from public.day_closes c where restaurant_id = rid and day = d),
    'methods', (select jsonb_build_object(
                  'cash', coalesce(sum(p.amount) filter (where p.method = 'cash'), 0),
                  'upi',  coalesce(sum(p.amount) filter (where p.method = 'upi'), 0),
                  'card', coalesce(sum(p.amount) filter (where p.method in ('card', 'mixed')), 0))
                  from public.payments p join public.visits v on v.id = p.visit_id
                 where p.restaurant_id = rid and v.status = 'paid' and p.status = 'captured' and (p.created_at at time zone tz)::date = d),
    'sales', (select coalesce(sum(total), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date = d),
    'bills', (select count(*) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date = d),
    'discounts', (select coalesce(sum(discount), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date = d),
    'tips', (select coalesce(sum(tip), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date = d),
    'voids', (select count(*) from public.visits where restaurant_id = rid and status = 'void' and (opened_at at time zone tz)::date = d),
    'open', (select count(*) from public.visits where restaurant_id = rid and status in ('open', 'bill')),
    'recent', coalesce((select jsonb_agg(to_jsonb(c) - 'restaurant_id' order by c.day desc)
                          from (select * from public.day_closes where restaurant_id = rid order by day desc limit 7) c), '[]'));
end $$;

create or replace function public.staff_close_day(p_day date, p_opening numeric, p_paid_out numeric, p_counted numeric, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant(); s jsonb; v_exp numeric; c public.day_closes; nm text;
begin
  perform public.need(public.is_manager());
  if p_day is null or p_day > public.ist_today() then raise exception 'You can''t close a day that hasn''t started.'; end if;
  if public.day_closed(rid, p_day) then raise exception 'This day is already closed.'; end if;
  if coalesce(p_opening, 0) < 0 or coalesce(p_paid_out, 0) < 0 or p_counted is null or p_counted < 0 then raise exception 'Check the cash amounts.'; end if;
  if length(coalesce(p_note, '')) > 300 then raise exception 'Keep the note under 300 characters.'; end if;
  s := public.staff_day_summary(p_day);
  if (s ->> 'open')::int > 0 then
    raise exception 'Take payment for or clear the % open bill(s) first.', s ->> 'open';
  end if;
  v_exp := coalesce(p_opening, 0) + (s -> 'methods' ->> 'cash')::numeric - coalesce(p_paid_out, 0);
  select coalesce(nullif(name, ''), '') into nm from public.memberships where user_id = auth.uid() and restaurant_id = rid;
  insert into public.day_closes (restaurant_id, day, opening_cash, cash_sales, upi_sales, card_sales, sales, bills, discounts, tips,
                                 paid_out, expected, counted, difference, note, closed_by, closed_by_name)
  values (rid, p_day, coalesce(p_opening, 0), (s -> 'methods' ->> 'cash')::numeric, (s -> 'methods' ->> 'upi')::numeric,
          (s -> 'methods' ->> 'card')::numeric, (s ->> 'sales')::numeric, (s ->> 'bills')::int, (s ->> 'discounts')::numeric,
          (s ->> 'tips')::numeric, coalesce(p_paid_out, 0), v_exp, p_counted, p_counted - v_exp, trim(coalesce(p_note, '')), auth.uid(), coalesce(nm, ''))
  returning * into c;
  perform public.log_it('day_closed', to_char(p_day, 'DD Mon YYYY') || ' · expected ₹' || v_exp || ' · counted ₹' || p_counted
                         || ' · ' || case when p_counted = v_exp then 'matches' when p_counted > v_exp then '₹' || (p_counted - v_exp) || ' extra' else '₹' || (v_exp - p_counted) || ' short' end);
  return to_jsonb(c) - 'restaurant_id';
end $$;

create or replace function public.owner_reopen_day(p_day date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.day_closes;
begin
  perform public.need(public.is_owner());
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a short reason.'; end if;
  delete from public.day_closes where restaurant_id = public.my_restaurant() and day = p_day returning * into c;
  if c.id is null then raise exception 'That day isn''t closed.'; end if;
  -- the closing numbers stay in the activity history
  perform public.log_it('day_reopened', to_char(p_day, 'DD Mon YYYY') || ' · was counted ₹' || c.counted || ' by ' || c.closed_by_name
                         || ' · ' || left(trim(p_reason), 120));
end $$;

-- -----------------------------------------------------------------------------
-- Menu and settings: stations and the discount limit
-- -----------------------------------------------------------------------------
create or replace function public.owner_save_category(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  if not public.station_ok(rid, p ->> 'station') then raise exception 'Pick a kitchen station from Settings.'; end if;
  if v_id is null then
    insert into public.categories (restaurant_id, name, sort, active, station)
    values (rid, trim(p ->> 'name'), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.categories where restaurant_id = rid)),
            coalesce((p ->> 'active')::boolean, true), coalesce(p ->> 'station', '')) returning id into v_id;
  else
    update public.categories set name = trim(coalesce(p ->> 'name', name)), sort = coalesce((p ->> 'sort')::int, sort),
           active = coalesce((p ->> 'active')::boolean, active), station = coalesce(p ->> 'station', station)
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That section is gone.'; end if;
  end if;
  return v_id;
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
  if not public.station_ok(rid, p ->> 'station') then raise exception 'Pick a kitchen station from Settings.'; end if;
  if v_id is null then
    insert into public.items (restaurant_id, category_id, name, description, price, diet, spice, allergens, sizes, addons, photo_url, bestseller, available, sort, station)
    values (rid, (p ->> 'category_id')::uuid, trim(p ->> 'name'), coalesce(p ->> 'description', ''), coalesce((p ->> 'price')::numeric, 0),
            coalesce(p ->> 'diet', 'veg'), nullif(p ->> 'spice', '')::smallint,
            coalesce(array(select jsonb_array_elements_text(p -> 'allergens')), '{}'), sz, ad, coalesce(p ->> 'photo_url', ''),
            coalesce((p ->> 'bestseller')::boolean, false), coalesce((p ->> 'available')::boolean, true),
            coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.items where restaurant_id = rid)),
            coalesce(p ->> 'station', ''))
    returning id into v_id;
  else
    update public.items set category_id = (p ->> 'category_id')::uuid, name = trim(p ->> 'name'), description = coalesce(p ->> 'description', ''),
      price = coalesce((p ->> 'price')::numeric, 0), diet = coalesce(p ->> 'diet', 'veg'), spice = nullif(p ->> 'spice', '')::smallint,
      allergens = coalesce(array(select jsonb_array_elements_text(p -> 'allergens')), '{}'), sizes = sz, addons = ad,
      photo_url = coalesce(p ->> 'photo_url', ''), bestseller = coalesce((p ->> 'bestseller')::boolean, false),
      available = coalesce((p ->> 'available')::boolean, true), sort = coalesce((p ->> 'sort')::int, sort),
      station = coalesce(p ->> 'station', station)
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That dish is gone.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.owner_save_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant(); st text[]; has_st boolean := p ? 'stations';
begin
  perform public.need(public.is_manager());
  if not public.is_owner() and exists (select 1 from jsonb_object_keys(p) k where k <> 'accepting_orders') then
    raise exception 'Only the owner can change settings.' using errcode = '42501';
  end if;
  if coalesce(p ->> 'cover_url', '') <> '' and (p ->> 'cover_url') !~ '^(https://|img/)' then
    raise exception 'The cover photo must be an uploaded photo.';
  end if;
  if has_st then
    if jsonb_typeof(p -> 'stations') <> 'array' then raise exception 'Stations must be a list.'; end if;
    -- trimmed, blanks dropped, the same name only once (first spelling kept), in the order given
    st := coalesce((select array_agg(x order by i) from (
            select distinct on (lower(trim(x))) trim(x) as x, i from jsonb_array_elements_text(p -> 'stations') with ordinality as t(x, i)
             where trim(x) <> '' order by lower(trim(x)), i) z), '{}');
    if coalesce(array_length(st, 1), 0) > 8 then raise exception 'Use up to 8 kitchen stations.'; end if;
    if exists (select 1 from unnest(st) x where length(x) > 24) then raise exception 'Keep station names under 24 characters.'; end if;
  end if;
  if p ? 'max_discount_pct' and ((p ->> 'max_discount_pct')::numeric not between 0 and 100) then
    raise exception 'The discount limit must be between 0 and 100%%.';
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
    stations          = case when has_st then st else stations end,
    max_discount_pct  = coalesce((p ->> 'max_discount_pct')::numeric, max_discount_pct),
    updated_at        = now()
   where restaurant_id = rid;
  -- a station that was removed is taken off its sections and dishes
  if has_st then
    update public.categories set station = '' where restaurant_id = rid and station <> '' and not station = any (st);
    update public.items set station = '' where restaurant_id = rid and station <> '' and not station = any (st);
  end if;
  if nullif(trim(p ->> 'restaurant_name'), '') is not null then
    update public.restaurants set name = left(trim(p ->> 'restaurant_name'), 80) where id = rid;
  end if;
  if p ? 'accepting_orders' then perform public.log_it(case when (p ->> 'accepting_orders')::boolean then 'orders_on' else 'orders_off' end, ''); end if;
  if p ? 'restaurant_name' or p ? 'upi_id' or p ? 'gst_pct' or p ? 'cover_url' or p ? 'max_discount_pct' then perform public.log_it('settings_changed', ''); end if;
end $$;

-- Report: payment mix from the payments themselves (a split bill counts in each method)
create or replace function public.owner_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text := 'Asia/Kolkata'; rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  return jsonb_build_object(
    'sales',   (select coalesce(sum(total), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'tips',    (select coalesce(sum(tip), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'gst',     (select coalesce(sum(gst), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'discounts', (select coalesce(sum(discount), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'bills',   (select count(*) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'guests',  (select coalesce(sum(guests), 0) from public.visits where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to),
    'voids',   (select count(*) from public.visits where restaurant_id = rid and status = 'void' and (opened_at at time zone tz)::date between p_from and p_to),
    'by_day',  (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'sales', s, 'bills', n) order by d), '[]') from (
                  select (paid_at at time zone tz)::date d, sum(total) s, count(*) n from public.visits
                   where restaurant_id = rid and status = 'paid' and (paid_at at time zone tz)::date between p_from and p_to group by 1) x),
    'by_hour', (select coalesce(jsonb_object_agg(h, n), '{}') from (
                  select extract(hour from opened_at at time zone tz)::int h, count(*) n from public.visits
                   where restaurant_id = rid and status = 'paid' and (opened_at at time zone tz)::date between p_from and p_to group by 1) x),
    'methods', (select coalesce(jsonb_object_agg(m, s), '{}') from (
                  select m, sum(a) s from (
                    select p.method m, p.amount a from public.payments p join public.visits v on v.id = p.visit_id
                     where v.restaurant_id = rid and v.status = 'paid' and (v.paid_at at time zone tz)::date between p_from and p_to
                    union all
                    select v.paid_method, v.total from public.visits v
                     where v.restaurant_id = rid and v.status = 'paid' and (v.paid_at at time zone tz)::date between p_from and p_to
                       and not exists (select 1 from public.payments p where p.visit_id = v.id)) y group by 1) x),
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

-- -----------------------------------------------------------------------------
-- Who may call what. Guests: still exactly the six guest_* functions. Helpers: nobody.
-- -----------------------------------------------------------------------------
revoke execute on function public.visit_label(public.visits), public.ist_today(), public.day_closed(uuid, date), public.next_token(uuid),
  public.station_ok(uuid, text), public.insert_order_items(uuid, uuid, jsonb), public.pay_visit(uuid, jsonb),
  public.order_open(public.orders, boolean) from public, anon, authenticated;
grant execute on function public.staff_takeaway_order(uuid, jsonb, text, uuid), public.staff_pay(uuid, jsonb),
  public.staff_set_discount(uuid, text, numeric, text), public.staff_item_done(bigint, boolean), public.staff_set_notice(text),
  public.staff_day_summary(date), public.staff_close_day(date, numeric, numeric, numeric, text), public.owner_reopen_day(date, text)
  to authenticated;
