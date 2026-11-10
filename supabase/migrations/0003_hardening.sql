-- =============================================================================
-- 0003 · Safety update (DineOS Phase 0.5). Run after 0001 and 0002. Fixes from docs/KNOWN_RISKS.md:
--   R-03  new functions are no longer runnable by guests by default
--   R-01  two first orders on one table at the same moment both succeed (no raw error)
--   R-02  order status follows allowed steps; no changes once the bill is paid or cleared
--   R-05  an order sent twice (retry / double tap) is saved once (request id)
--   R-08  every payment is recorded: method, amount, reference (UPI UTR / card slip), who, when
--   R-12  activity log also records payments, menu price changes, bill split/tip changes
--   R-13  changing a login's email also updates the Team list
--   R-14  tip choices limited to 0–30 %
-- =============================================================================

-- R-03 ---------------------------------------------------------------------------
-- Supabase lets anon/authenticated run every NEW function in "public" unless told otherwise.
-- From now on nothing is runnable until a migration grants it on purpose.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

-- R-05 / R-08 schema --------------------------------------------------------------
alter table public.orders add column if not exists request_id uuid;
create unique index if not exists orders_request_id_key on public.orders (request_id) where request_id is not null;

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visits (id) on delete cascade,
  method      text not null check (method in ('upi', 'cash', 'card', 'mixed')),
  amount      numeric(10,2) not null check (amount >= 0),
  reference   text not null default '' check (length(reference) <= 60),
  status      text not null default 'captured' check (status in ('captured', 'refunded')),
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists payments_visit_idx on public.payments (visit_id);
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- R-14 ------------------------------------------------------------------------------
create or replace function public.tips_ok(a int[]) returns boolean
language sql immutable as $$ select coalesce(bool_and(x between 0 and 30), true) from unnest(a) x $$;
alter table public.settings drop constraint if exists settings_tip_options_range;
alter table public.settings add constraint settings_tip_options_range check (public.tips_ok(tip_options));

-- R-01 + R-05: add_order gets a request id and survives a simultaneous first order --------
drop function if exists public.staff_add_order(uuid, jsonb, text, int);
drop function if exists public.guest_order(text, jsonb, text, int);
drop function if exists public.add_order(uuid, jsonb, text, int, text);

create function public.add_order(p_table uuid, p_items jsonb, p_note text, p_guests int, p_source text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.visits; o public.orders; lines jsonb; l jsonb;
begin
  -- Same request seen before (retry, double tap): hand back what was saved, change nothing.
  if p_request is not null then
    select * into o from public.orders where request_id = p_request;
    if found then
      if o.table_id <> p_table then raise exception 'That order belongs to another table.'; end if;
      return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true);
    end if;
  end if;
  lines := public.price_cart(p_items);
  select * into v from public.visits where table_id = p_table and status in ('open', 'bill') for update;
  if not found then
    -- Two first orders at once: one creates the visit, the other waits and then joins it.
    insert into public.visits (table_id, guests) values (p_table, case when p_guests between 1 and 40 then p_guests end)
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
  insert into public.orders (visit_id, table_id, source, created_by, note, request_id)
  values (v.id, p_table, p_source, auth.uid(), left(coalesce(p_note, ''), 300), p_request) returning * into o;
  for l in select * from jsonb_array_elements(lines) loop
    insert into public.order_items (order_id, item_id, name, size, addons, diet, qty, unit_price, line_total, note)
    values (o.id, (l ->> 'item_id')::uuid, l ->> 'name', l ->> 'size', array(select jsonb_array_elements_text(l -> 'addons')),
            l ->> 'diet', (l ->> 'qty')::int, (l ->> 'unit_price')::numeric, (l ->> 'line_total')::numeric, l ->> 'note');
  end loop;
  return jsonb_build_object('order', public.order_json(o), 'visit_id', v.id);
exception when unique_violation then
  -- the same request id raced itself: return the order that won
  select * into o from public.orders where request_id = p_request;
  if found then return jsonb_build_object('order', public.order_json(o), 'visit_id', o.visit_id, 'repeat', true); end if;
  raise;
end $$;

create function public.guest_order(p_token text, p_items jsonb, p_note text default '', p_guests int default null, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.dining_tables;
begin
  t := public.table_by_token(p_token);
  if not (select accepting_orders from public.settings where id = 1) then
    raise exception '%', (select closed_message from public.settings where id = 1);
  end if;
  return public.add_order(t.id, p_items, p_note, p_guests, 'guest', p_request_id);
end $$;

create function public.staff_add_order(p_table uuid, p_items jsonb, p_note text default '', p_guests int default null, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  if not exists (select 1 from public.dining_tables where id = p_table) then raise exception 'Unknown table.'; end if;
  return public.add_order(p_table, p_items, p_note, p_guests, 'staff', p_request_id);
end $$;

-- R-02: allowed status steps ---------------------------------------------------------
create or replace function public.order_step_ok(p_from text, p_to text) returns boolean
language sql immutable as $$
  select (p_from, p_to) in (
    ('new', 'cooking'), ('new', 'cancelled'),
    ('cooking', 'ready'), ('cooking', 'new'), ('cooking', 'cancelled'),
    ('ready', 'served'), ('ready', 'cooking'), ('ready', 'cancelled'),
    ('served', 'ready'))
$$;

create or replace function public.staff_order_status(p_order uuid, p_status text, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r text := public.my_role(); vs text;
begin
  perform public.need(r is not null);
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'That order is gone.'; end if;
  if p_status not in ('new', 'cooking', 'ready', 'served', 'cancelled') then raise exception 'Unknown status.'; end if;
  select status into vs from public.visits where id = o.visit_id;
  if vs in ('paid', 'void') then raise exception 'This bill is already closed, so its orders can''t change.'; end if;
  if o.status = p_status then return public.order_json(o); end if;            -- double tap: nothing to do
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

-- R-08 + R-12: mark paid records a payment and logs it -------------------------------
drop function if exists public.staff_mark_paid(uuid, text);
create function public.staff_mark_paid(p_visit uuid, p_method text, p_reference text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; v public.visits; tcode text;
begin
  perform public.need(public.is_floor());
  if p_method not in ('upi', 'cash', 'card', 'mixed') then raise exception 'Pick how they paid.'; end if;
  if length(coalesce(p_reference, '')) > 60 then raise exception 'The reference is too long.'; end if;
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
  insert into public.payments (visit_id, method, amount, reference, created_by)
  values (p_visit, p_method, (b ->> 'grand')::numeric, trim(coalesce(p_reference, '')), auth.uid());
  update public.orders set status = 'served', served_at = coalesce(served_at, now()) where visit_id = p_visit and status = 'ready';
  update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  select code into tcode from public.dining_tables where id = v.table_id;
  perform public.log_it('bill_paid', tcode || ' · ' || upper(p_method) || ' · ₹' || (b ->> 'grand')
                         || coalesce(' · ref ' || nullif(trim(p_reference), ''), ''));
  return public.visit_bill(p_visit);
end $$;

-- Bills list: add the payment reference
create or replace function public.staff_bills(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table', t.code, 'opened_at', v.opened_at, 'paid_at', v.paid_at,
      'status', v.status, 'method', v.paid_method, 'total', v.total, 'tip', v.tip, 'guests', v.guests, 'void_reason', v.void_reason,
      'by', (select name from public.staff where id = v.paid_by), 'bill', public.visit_bill(v.id),
      'ref', (select string_agg(nullif(p.reference, ''), ', ') from public.payments p where p.visit_id = v.id),
      'stars', (select stars from public.reviews where visit_id = v.id)) order by coalesce(v.paid_at, v.opened_at) desc)
    from public.visits v join public.dining_tables t on t.id = v.table_id
   where v.status in ('paid', 'void') and (coalesce(v.paid_at, v.opened_at) at time zone 'Asia/Kolkata')::date between p_from and p_to), '[]');
end $$;

-- R-12: menu and bill changes go to the activity log (only changes made by signed-in staff) --
create or replace function public.audit_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then
    perform public.log_it('dish_added', new.name || ' · ₹' || new.price);
  elsif tg_op = 'UPDATE' then
    if old.price is distinct from new.price or old.sizes is distinct from new.sizes or old.addons is distinct from new.addons then
      perform public.log_it('price_changed', new.name || ' · ₹' || old.price || ' → ₹' || new.price
        || case when old.sizes is distinct from new.sizes or old.addons is distinct from new.addons then ' · sizes/extras changed' else '' end);
    end if;
    if old.name is distinct from new.name then perform public.log_it('dish_renamed', old.name || ' → ' || new.name); end if;
  elsif tg_op = 'DELETE' then
    perform public.log_it('dish_deleted', old.name || ' · ₹' || old.price);
  end if;
  return null;
end $$;
drop trigger if exists items_audit on public.items;
create trigger items_audit after insert or update or delete on public.items for each row execute function public.audit_items();

create or replace function public.audit_visits() returns trigger
language plpgsql security definer set search_path = public as $$
declare tcode text;
begin
  if auth.uid() is null or new.status not in ('open', 'bill') then return null; end if;
  if old.split is distinct from new.split or old.tip_pct is distinct from new.tip_pct then
    select code into tcode from public.dining_tables where id = new.table_id;
    perform public.log_it('bill_changed', tcode || ' · split ' || old.split || '→' || new.split || ' · tip ' || old.tip_pct || '%→' || new.tip_pct || '%');
  end if;
  return null;
end $$;
drop trigger if exists visits_audit on public.visits;
create trigger visits_audit after update on public.visits for each row execute function public.audit_visits();

-- owner_delete_item logged an empty detail; the trigger now logs the name instead
create or replace function public.owner_delete_item(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  perform public.need(public.is_manager());
  delete from public.items where id = p_id returning photo_url into ph;
  return ph;
end $$;

-- R-13: Team edits keep the shown email in step ----------------------------------------
drop function if exists public.owner_edit_staff(uuid, text, text, text, boolean);
create function public.owner_edit_staff(p_id uuid, p_name text, p_phone text, p_role text, p_active boolean, p_email text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_owner());
  if p_role not in ('owner', 'manager', 'waiter', 'kitchen') then raise exception 'Unknown role.'; end if;
  if p_id = auth.uid() and (p_role <> 'owner' or p_active = false) then raise exception 'You can''t remove your own owner access.'; end if;
  update public.staff set name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone), role = p_role,
         active = coalesce(p_active, active), email = coalesce(nullif(lower(trim(p_email)), ''), email) where id = p_id;
  perform public.log_it('login_changed', coalesce(p_name, '') || ' (' || p_role || ')');
end $$;

-- Grants for everything (re)created above. Guests: exactly six functions, nothing else. ------
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
  public.owner_log(text, text), public.owner_activity(int),
  public.is_staff(), public.is_manager(), public.is_owner()
  to authenticated;
