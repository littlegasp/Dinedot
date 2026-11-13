-- =============================================================================
-- 0010 · Only the people at the table can order. Run after 0001–0009.
--
-- A photo of a table's QR, or its link shared on WhatsApp, used to work from anywhere and
-- for ever. Now (Settings → "Waiter approves new tables", on by default):
-- * The first order of a visit waits for a waiter: it shows on Floor as "T5 wants to order"
--   with Accept / Deny, and reaches the kitchen only after Accept. Deny cancels it.
-- * That first phone gets the table's 4-digit code. Other phones at the table join with it
--   (guest_join). 3 wrong tries lock that phone; 10 wrong tries at a table lock the code until
--   a waiter makes a new one. The code dies with the visit (paid or void), so old photos and
--   screenshots are useless.
-- * Phones are told apart by a random device id the guest page keeps (no name, phone or
--   email). Only phones that joined see the table's orders, bill, Wi-Fi and receipt.
-- * Orders a member of staff takes (POS) need no OK: the visit is accepted at once.
-- Guests can now run seven guest_* functions (guest_join is new). Nothing is deleted.
-- =============================================================================

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

alter table public.settings add column if not exists approve_tables boolean not null default true;
alter table public.visits
  add column if not exists approved    boolean not null default true,
  add column if not exists approved_by uuid,
  add column if not exists join_code   text check (join_code ~ '^[0-9]{4}$'),
  add column if not exists join_fails  int not null default 0;

create table if not exists public.guest_devices (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  visit_id      uuid not null references public.visits (id) on delete cascade,
  device        text not null check (device ~ '^[A-Za-z0-9-]{16,64}$'),
  status        text not null default 'in' check (status in ('in', 'out', 'denied')),
  tries         int  not null default 0,
  created_at    timestamptz not null default now(),
  primary key (visit_id, device)
);
alter table public.guest_devices enable row level security;
revoke all on public.guest_devices from anon, authenticated;
create trigger a_restaurant_id before insert or update on public.guest_devices for each row execute function public.set_restaurant_id();
create or replace function public.guest_device_restaurant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.restaurant_id is distinct from (select restaurant_id from public.visits where id = new.visit_id) then
    raise exception 'That belongs to another restaurant.';
  end if;
  return new;
end $$;
create trigger b_restaurant_check before insert or update on public.guest_devices for each row execute function public.guest_device_restaurant();

-- -----------------------------------------------------------------------------
-- Helpers (not callable from the app)
-- -----------------------------------------------------------------------------
create or replace function public.new_join_code() returns text
language sql volatile as $$ select lpad((floor(random() * 10000))::int::text, 4, '0') $$;

-- every visit has a code, also one a waiter opened from the POS (guests then ask the waiter for it)
alter table public.visits alter column join_code set default public.new_join_code();
update public.visits set join_code = public.new_join_code() where join_code is null and status in ('open', 'bill');

create or replace function public.device_in(p_visit uuid, p_device text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.guest_devices where visit_id = p_visit and device = p_device and status = 'in')
$$;

-- Is this phone allowed at this table's open visit? (approval off: always)
create or replace function public.guest_may(t public.dining_tables, p_device text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  if not coalesce((select approve_tables from public.settings where restaurant_id = t.restaurant_id), false) then return true; end if;
  select id into v from public.visits where table_id = t.id and status in ('open', 'bill');
  return v is null or public.device_in(v, coalesce(p_device, ''));
end $$;

-- Orders of a visit nobody has accepted yet don't move (except being cancelled)
create or replace function public.order_needs_ok() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'cancelled'
     and not coalesce((select approved from public.visits where id = new.visit_id), true) then
    raise exception 'This table is waiting for a waiter''s OK. Accept it on Floor first.';
  end if;
  return new;
end $$;
create trigger a_order_needs_ok before update of status on public.orders for each row execute function public.order_needs_ok();

-- An order staff take (POS) accepts the visit: they're at the table
create or replace function public.staff_order_accepts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source <> 'guest' then
    update public.visits set approved = true, approved_by = coalesce(approved_by, auth.uid()) where id = new.visit_id and not approved;
  end if;
  return null;
end $$;
-- named to run before push_on_order (after-triggers run in name order), so the kitchen is told
create trigger a_staff_order_accepts after insert on public.orders for each row execute function public.staff_order_accepts();

-- Same as 0007, but a waiting visit's orders don't alert the kitchen yet
create or replace function public.push_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce((select approved from public.visits where id = new.visit_id), true) then perform public.push_send('order', new.id); end if;
  elsif new.status = 'ready' and old.status is distinct from 'ready' then perform public.push_send('ready', new.id);
  end if;
  return null;
end $$;

-- Same as 0007, plus "T5 wants to order" for the floor team (kind 'table', id = the visit)
create or replace function public.push_hook(p_kind text, p_id uuid, p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid; title text; body text; url text; roles text[]; o public.orders; v public.visits; c public.calls;
begin
  if p_secret is null or p_secret <> (select hook_secret from public.push_config where id = 1) then return null; end if;
  if p_kind in ('order', 'ready') then
    select * into o from public.orders where id = p_id; if not found then return jsonb_build_object('subs', '[]'::jsonb); end if;
    select * into v from public.visits where id = o.visit_id; rid := o.restaurant_id;
    if p_kind = 'order' then
      title := 'New order · ' || public.visit_label(v) || ' · #' || o.no; roles := array['kitchen']; url := './#/kitchen';
      body := (select string_agg(qty || '× ' || name, ', ' order by id) from public.order_items where order_id = o.id);
    else
      title := 'Ready to serve · ' || public.visit_label(v); roles := array['cashier', 'waiter']; url := './#/floor';
      body := 'Order #' || o.no || coalesce(' · ' || (select string_agg(qty || '× ' || name, ', ' order by id) from public.order_items where order_id = o.id), '');
    end if;
  elsif p_kind = 'call' then
    select * into c from public.calls where id = p_id; if not found then return jsonb_build_object('subs', '[]'::jsonb); end if;
    rid := c.restaurant_id; roles := array['owner', 'manager', 'cashier', 'waiter']; url := './#/floor';
    title := (select code from public.dining_tables where id = c.table_id) || ' ' ||
             case c.kind when 'waiter' then 'called a waiter' when 'water' then 'asked for water' when 'bill' then 'asked for the bill' else 'needs help' end;
    body := 'Tap to open the floor';
  elsif p_kind = 'table' then   -- 0010: a new table's first order waits for a waiter's OK
    select * into v from public.visits where id = p_id; if not found or v.approved then return jsonb_build_object('subs', '[]'::jsonb); end if;
    rid := v.restaurant_id; roles := array['owner', 'manager', 'cashier', 'waiter']; url := './#/floor';
    title := public.visit_label(v) || ' wants to order';
    body := 'Check the table, then Accept or Deny · ' || coalesce((select string_agg(oi.qty || '× ' || oi.name, ', ' order by oi.id)
              from public.order_items oi join public.orders o2 on o2.id = oi.order_id where o2.visit_id = v.id), '');
  else return null;
  end if;
  return jsonb_build_object('title', title, 'body', left(coalesce(body, ''), 160), 'url', url, 'tag', p_kind || '-' || p_id,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]')
               from public.push_subs s join public.memberships m on m.user_id = s.user_id and m.restaurant_id = s.restaurant_id
              where s.restaurant_id = rid and m.active and m.role = any (roles)));
end $$;

-- -----------------------------------------------------------------------------
-- Guests
-- -----------------------------------------------------------------------------
drop function if exists public.guest_order(text, jsonb, text, int, uuid);
create function public.guest_order(p_token text, p_items jsonb, p_note text default '', p_guests int default null,
                                   p_request_id uuid default null, p_device text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; s public.settings; v public.visits; r jsonb; dev text := coalesce(p_device, '');
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where restaurant_id = t.restaurant_id;
  if not s.accepting_orders then raise exception '%', s.closed_message; end if;
  if s.approve_tables then
    if dev !~ '^[A-Za-z0-9-]{16,64}$' then raise exception 'Please reload this page, then order again.'; end if;
    -- a repeat of an order already saved (dropped connection) just returns it
    if p_request_id is not null and exists (select 1 from public.orders where request_id = p_request_id) then
      return public.add_order(t.id, p_items, p_note, p_guests, 'guest', p_request_id);
    end if;
    select * into v from public.visits where table_id = t.id and status in ('open', 'bill') for update;
    if found then
      if not public.device_in(v.id, dev) then raise exception 'Enter your table code to order. Ask someone at your table for it.'; end if;
    else
      -- the first phone at the table: a new visit that waits for a waiter's OK
      if not public.day_closed(t.restaurant_id) then
        insert into public.visits (restaurant_id, table_id, guests, approved, join_code)
        values (t.restaurant_id, t.id, case when p_guests between 1 and 40 then p_guests end, false, public.new_join_code())
        on conflict (table_id) where status in ('open', 'bill') do nothing
        returning * into v;
        if v.id is null then raise exception 'Someone at this table has just ordered. Ask them for the table code.'; end if;
        insert into public.guest_devices (restaurant_id, visit_id, device) values (t.restaurant_id, v.id, dev);
      end if;
    end if;
  end if;
  r := public.add_order(t.id, p_items, p_note, p_guests, 'guest', p_request_id);
  if s.approve_tables and v.id is not null and not v.approved and v.id = (r ->> 'visit_id')::uuid
     and (select count(*) from public.orders where visit_id = v.id) = 1 then
    perform public.push_send('table', v.id);   -- the floor team's phones: a new table wants to order
  end if;
  return r || jsonb_build_object('waiting', not coalesce((select approved from public.visits where id = (r ->> 'visit_id')::uuid), true));
end $$;

-- p_code: the table's 4 digits. Returns the state like guest_state.
create or replace function public.guest_join(p_token text, p_device text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; d public.guest_devices; left_ int;
begin
  t := public.table_by_token(p_token);
  if coalesce(p_device, '') !~ '^[A-Za-z0-9-]{16,64}$' then raise exception 'Please reload this page and try again.'; end if;
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill') for update;
  if not found then raise exception 'Nobody has ordered at this table yet. Order to start the table.'; end if;
  if public.device_in(v.id, p_device) then return public.guest_state(p_token, p_device); end if;
  select * into d from public.guest_devices where visit_id = v.id and device = p_device;
  if d.status = 'denied' or coalesce(d.tries, 0) >= 3 then raise exception 'Too many wrong codes on this phone. Ask your waiter for help.'; end if;
  if v.join_fails >= 10 then raise exception 'Too many wrong codes at this table. Ask your waiter for a new code.'; end if;
  if coalesce(p_code, '') <> v.join_code then
    insert into public.guest_devices (restaurant_id, visit_id, device, status, tries) values (t.restaurant_id, v.id, p_device, 'out', 1)
    on conflict (visit_id, device) do update set tries = public.guest_devices.tries + 1;
    update public.visits set join_fails = join_fails + 1 where id = v.id;
    left_ := 3 - (select tries from public.guest_devices where visit_id = v.id and device = p_device);
    -- returned (not raised) so the wrong try is saved
    return jsonb_build_object('wrong', true, 'tries_left', greatest(left_, 0));
  end if;
  insert into public.guest_devices (restaurant_id, visit_id, device, status) values (t.restaurant_id, v.id, p_device, 'in')
  on conflict (visit_id, device) do update set status = 'in';
  return public.guest_state(p_token, p_device);
end $$;

drop function if exists public.guest_state(text);
create function public.guest_state(p_token text, p_device text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; s public.settings; last_paid public.visits; d public.guest_devices; gate boolean;
begin
  t := public.table_by_token(p_token);
  select * into s from public.settings where restaurant_id = t.restaurant_id;
  gate := s.approve_tables;
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill');
  if not found then
    select * into last_paid from public.visits where table_id = t.id and status = 'paid' and paid_at > now() - interval '2 hours'
       and (not gate or public.device_in(id, coalesce(p_device, '')))
     order by paid_at desc limit 1;
    return jsonb_build_object('visit', null, 'now', now(), 'access', 'open',
      -- this phone's first order was turned down a moment ago
      'denied', gate and exists (select 1 from public.visits x join public.guest_devices g on g.visit_id = x.id
                                  where x.table_id = t.id and x.status = 'void' and g.device = coalesce(p_device, '') and g.status = 'denied'
                                    and x.opened_at > now() - interval '30 minutes'),
      'last_paid', case when last_paid.id is null then null else jsonb_build_object('id', last_paid.id, 'paid_at', last_paid.paid_at,
        'total', last_paid.total, 'reviewed', exists (select 1 from public.reviews where visit_id = last_paid.id),
        'receipt', public.receipt_json(last_paid.id) - 'by') end);
  end if;
  if gate and not public.device_in(v.id, coalesce(p_device, '')) then
    select * into d from public.guest_devices where visit_id = v.id and device = coalesce(p_device, '');
    return jsonb_build_object('visit', null, 'now', now(), 'last_paid', null,
      'access', case when d.status = 'denied' or coalesce(d.tries, 0) >= 3 or v.join_fails >= 10 then 'locked' else 'code' end,
      'tries_left', greatest(0, 3 - coalesce(d.tries, 0)));
  end if;
  return jsonb_build_object('now', now(), 'last_paid', null, 'access', 'in',
    'visit', jsonb_build_object('id', v.id, 'status', v.status, 'guests', v.guests, 'split', v.split, 'tip_pct', v.tip_pct, 'pay_choice', v.pay_choice,
      'waiting', not v.approved, 'join_code', case when gate then v.join_code end,
      'orders', coalesce((select jsonb_agg(public.order_json(o) order by o.created_at) from public.orders o where o.visit_id = v.id), '[]'),
      'calls', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'at', c.created_at, 'seen', c.seen_at is not null) order by c.created_at)
                           from public.calls c where c.visit_id = v.id and c.done_at is null), '[]'),
      'bill', public.visit_bill(v.id),
      'wifi', case when s.wifi_name <> '' then jsonb_build_object('name', s.wifi_name, 'password', s.wifi_password) end,
      'upi', case when s.pay_upi and s.upi_id <> '' then jsonb_build_object('id', s.upi_id, 'name', coalesce(nullif(s.upi_name, ''), s.restaurant_name)) end));
end $$;

drop function if exists public.guest_call(text, text);
create function public.guest_call(p_token text, p_kind text, p_device text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v uuid;
begin
  t := public.table_by_token(p_token);
  if p_kind not in ('waiter', 'water', 'bill', 'help') then raise exception 'Unknown request.'; end if;
  if not public.guest_may(t, p_device) then raise exception 'Enter your table code first. Ask someone at your table for it.'; end if;
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

-- Same as 0009, for phones that joined the table
drop function if exists public.guest_bill(text, int, numeric, text, numeric);
create function public.guest_bill(p_token text, p_split int, p_tip_pct numeric, p_pay text, p_tip_amount numeric default 0, p_device text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; tips int[]; amt numeric := round(coalesce(p_tip_amount, 0)); b jsonb;
begin
  t := public.table_by_token(p_token);
  if not public.guest_may(t, p_device) then raise exception 'Enter your table code first. Ask someone at your table for it.'; end if;
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill') for update;
  if not found then raise exception 'There''s no open bill for this table.'; end if;
  if not v.approved then raise exception 'Your waiter hasn''t confirmed your table yet.'; end if;
  if not exists (select 1 from public.orders where visit_id = v.id and status <> 'cancelled') then raise exception 'Nothing has been ordered yet.'; end if;
  select tip_options into tips from public.settings where restaurant_id = t.restaurant_id;
  if amt < 0 then raise exception 'The tip can''t be below zero.'; end if;
  if amt = 0 and coalesce(p_tip_pct, 0) <> 0 and not (p_tip_pct::int = any (tips)) then raise exception 'Pick one of the tip options.'; end if;
  if amt > 0 then
    b := public.visit_bill(v.id);
    if amt > greatest((b ->> 'total')::numeric, 1) then raise exception 'The tip can''t be more than the bill.'; end if;
  end if;
  if coalesce(p_pay, '') not in ('', 'upi', 'cash', 'card') then raise exception 'Pick how you''d like to pay.'; end if;
  update public.visits set status = 'bill', bill_at = coalesce(bill_at, now()),
         split = greatest(1, least(coalesce(p_split, 1), 20)),
         tip_pct = case when amt > 0 then 0 else coalesce(p_tip_pct, 0) end, tip_amount = amt,
         pay_choice = coalesce(p_pay, '')
   where id = v.id;
  if not exists (select 1 from public.calls where table_id = t.id and kind = 'bill' and done_at is null) then
    insert into public.calls (restaurant_id, table_id, visit_id, kind) values (t.restaurant_id, t.id, v.id, 'bill');
  end if;
  return public.visit_bill(v.id);
end $$;

-- -----------------------------------------------------------------------------
-- Staff
-- -----------------------------------------------------------------------------
-- Accept (the kitchen gets the orders) or Deny (the orders are cancelled, the visit closed)
create or replace function public.staff_accept_table(p_visit uuid, p_ok boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.visits; o record;
begin
  perform public.need(public.is_floor());
  select * into v from public.visits where id = p_visit and restaurant_id = public.my_restaurant() for update;
  if not found or v.status not in ('open', 'bill') then raise exception 'That table has already left.'; end if;
  if v.approved then return jsonb_build_object('ok', true, 'already', true); end if;
  if p_ok then
    update public.visits set approved = true, approved_by = auth.uid() where id = v.id;
    for o in select id from public.orders where visit_id = v.id and status = 'new' order by created_at loop
      perform public.push_send('order', o.id);
    end loop;
    perform public.log_at(v.restaurant_id, 'table_accepted', public.visit_label(v));
  else
    update public.orders set status = 'cancelled' where visit_id = v.id and status <> 'cancelled';
    update public.visits set status = 'void', void_reason = 'Turned down: not at the table' where id = v.id;
    update public.guest_devices set status = 'denied' where visit_id = v.id;
    update public.calls set done_at = now() where visit_id = v.id and done_at is null;
    perform public.log_at(v.restaurant_id, 'table_denied', public.visit_label(v));
  end if;
  return jsonb_build_object('ok', true, 'already', false);
end $$;

-- A new table code (after too many wrong tries, or if it got out); phones already in stay in
create or replace function public.staff_new_join_code(p_visit uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := public.new_join_code();
begin
  perform public.need(public.is_floor());
  update public.visits set join_code = c, join_fails = 0
   where id = p_visit and restaurant_id = public.my_restaurant() and status in ('open', 'bill');
  if not found then raise exception 'That table has already left.'; end if;
  delete from public.guest_devices where visit_id = p_visit and status = 'out';
  perform public.log_at((select restaurant_id from public.visits where id = p_visit), 'join_code_changed',
                        (select public.visit_label(v) from public.visits v where id = p_visit));
  return c;
end $$;

create or replace function public.owner_set_table_approval(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  update public.settings set approve_tables = coalesce(p_on, true) where restaurant_id = public.my_restaurant();
  perform public.log_it('setting_changed', 'Waiter approves new tables: ' || case when p_on then 'on' else 'off' end);
end $$;

-- staff_live: the switch, and each visit's OK and table code
do $$ declare src text; begin
  select pg_get_functiondef('public.staff_live()'::regprocedure) into src;
  if position('''approve_tables''' in src) = 0 then
    src := replace(src, $q$'day_closed', public.day_closed(rid))$q$, $q$'day_closed', public.day_closed(rid), 'approve_tables', approve_tables)$q$);
    src := replace(src, $q$'status', v.status, 'opened_at', v.opened_at,$q$,
                        $q$'status', v.status, 'opened_at', v.opened_at, 'approved', v.approved, 'join_code', v.join_code,$q$);
    if position('''approve_tables''' in src) = 0 or position('''join_code''' in src) = 0 then
      raise exception '0010: couldn''t add the table OK to staff_live';
    end if;
    execute src;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke execute on function public.new_join_code(), public.device_in(uuid, text), public.guest_may(public.dining_tables, text),
  public.order_needs_ok(), public.staff_order_accepts(), public.guest_device_restaurant() from public, anon, authenticated;
grant execute on function public.guest_order(text, jsonb, text, int, uuid, text), public.guest_join(text, text, text),
  public.guest_state(text, text), public.guest_call(text, text, text), public.guest_bill(text, int, numeric, text, numeric, text)
  to anon, authenticated;
grant execute on function public.staff_accept_table(uuid, boolean), public.staff_new_join_code(uuid), public.owner_set_table_approval(boolean)
  to authenticated;
