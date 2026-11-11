-- =============================================================================
-- 0006 · GST bills and the cashier role (DineOS). Run after 0001–0005.
--
-- What changes
-- * Settings get the details a GST bill must show: legal name, address, GSTIN, FSSAI licence,
--   SAC code (996331 = restaurant service), an invoice prefix and a footer line. A restaurant on
--   the GST composition scheme prints a "Bill of supply" and may not charge GST.
-- * Every paid bill gets an invoice number when it is paid: prefix + financial year + running
--   number (for example CP2627-0001). Numbers never skip, start again each 1 April, are unique per
--   restaurant and are at most 16 characters (GST rule 46).
-- * staff_receipt(visit) returns everything a printed bill needs, with GST split into CGST and
--   SGST. Guests get the same receipt for their last paid bill through guest_state (no new guest
--   function: guests still run exactly the six guest_* functions).
-- * New role: cashier — POS, takeaway, payments, bills (same database rights as a waiter; the
--   app opens on the POS). No discounts and no clearing tables, as before for waiters.
-- Nothing is deleted.
-- =============================================================================

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
alter table public.settings
  add column if not exists legal_name      text not null default '' check (length(legal_name) <= 120),
  add column if not exists bill_address    text not null default '' check (length(bill_address) <= 300),
  add column if not exists gstin           text not null default '' check (gstin = '' or gstin ~ '^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$'),
  add column if not exists fssai           text not null default '' check (fssai = '' or fssai ~ '^[0-9]{14}$'),
  add column if not exists sac             text not null default '996331' check (sac ~ '^[0-9]{4,8}$'),
  add column if not exists gst_composition boolean not null default false,
  add column if not exists invoice_prefix  text not null default '' check (invoice_prefix ~ '^[A-Z0-9]{0,5}$'),
  add column if not exists bill_footer     text not null default 'Thank you! Please visit again.' check (length(bill_footer) <= 160),
  add column if not exists receipt_width   int  not null default 80 check (receipt_width in (58, 80));

alter table public.restaurants
  add column if not exists invoice_fy      text,
  add column if not exists last_invoice_no int not null default 0;

alter table public.visits add column if not exists invoice_no text;
create unique index if not exists visits_invoice_no_key on public.visits (restaurant_id, invoice_no) where invoice_no is not null;

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('owner', 'manager', 'cashier', 'waiter', 'kitchen'));

-- -----------------------------------------------------------------------------
-- Cashier: same rights as a waiter in the database
-- -----------------------------------------------------------------------------
create or replace function public.is_floor() returns boolean   -- can take orders, bills and calls
language sql stable security definer set search_path = public as $$ select public.my_role() in ('owner', 'manager', 'cashier', 'waiter') $$;

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
    perform public.need(r in ('owner', 'manager') or (r in ('waiter', 'cashier') and o.status = 'new'));
  end if;
  was := o.status;
  update public.orders set status = p_status,
    started_at = case when p_status = 'new' then null else coalesce(started_at, case when p_status <> 'cancelled' then now() end) end,
    ready_at   = case when p_status in ('new', 'cooking') then null when p_status in ('ready', 'served') then coalesce(ready_at, now()) else ready_at end,
    served_at  = case when p_status = 'served' then coalesce(served_at, now()) when p_status = 'cancelled' then served_at else null end,
    cancel_reason = case when p_status = 'cancelled' then left(coalesce(p_reason, ''), 200) else '' end
   where id = p_order returning * into o;
  if p_status in ('ready', 'served') then
    update public.order_items set done_at = coalesce(done_at, now()) where order_id = p_order;
  elsif p_status = 'new' or (p_status = 'cooking' and was in ('ready', 'served')) then
    update public.order_items set done_at = null where order_id = p_order;
  end if;
  if p_status = 'cancelled' then perform public.log_it('order_cancelled', '#' || o.no || coalesce(' · ' || nullif(p_reason, ''), '')); end if;
  return public.order_json(o);
end $$;

create or replace function public.owner_edit_staff(p_id uuid, p_name text, p_phone text, p_role text, p_active boolean, p_email text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_owner());
  if p_role not in ('owner', 'manager', 'cashier', 'waiter', 'kitchen') then raise exception 'Unknown role.'; end if;
  if p_id = auth.uid() and (p_role <> 'owner' or p_active = false) then raise exception 'You can''t remove your own owner access.'; end if;
  update public.memberships set name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone), role = p_role,
         active = coalesce(p_active, active)
   where user_id = p_id and restaurant_id = rid;
  if not found then raise exception 'That person isn''t on your team.'; end if;
  if public.owner_controls_login(p_id) then
    update public.staff set name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone),
           email = coalesce(nullif(lower(trim(p_email)), ''), email) where id = p_id;
  end if;
  perform public.log_it('login_changed', coalesce(p_name, '') || ' (' || p_role || ')');
end $$;

-- -----------------------------------------------------------------------------
-- Invoice numbers: prefix + financial year (2627 = Apr 2026–Mar 2027) + running number
-- -----------------------------------------------------------------------------
create or replace function public.fy_code(p_day date) returns text
language sql immutable as $$
  select lpad(((extract(year from p_day)::int - case when extract(month from p_day) < 4 then 1 else 0 end) % 100)::text, 2, '0')
      || lpad(((extract(year from p_day)::int - case when extract(month from p_day) < 4 then 1 else 0 end + 1) % 100)::text, 2, '0');
$$;

create or replace function public.next_invoice(p_restaurant uuid) returns text
language plpgsql security definer set search_path = public as $$
declare fy text := public.fy_code(public.ist_today()); n int; pre text;
begin
  -- the row lock on the restaurant makes numbers consecutive even when two tills pay at once
  update public.restaurants set last_invoice_no = case when invoice_fy = fy then last_invoice_no + 1 else 1 end, invoice_fy = fy
   where id = p_restaurant returning last_invoice_no into n;
  select invoice_prefix into pre from public.settings where restaurant_id = p_restaurant;
  return coalesce(pre, '') || fy || '-' || lpad(n::text, 4, '0');
end $$;

-- Same as 0005, plus the invoice number given at the moment of payment
create or replace function public.pay_visit(p_visit uuid, p_parts jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b jsonb; v public.visits; p jsonb; n int; tot numeric := 0; methods text[] := '{}'; m text; amt numeric; ref text;
        grand numeric; detail text := ''; refs text := ''; inv text;
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
  inv := public.next_invoice(v.restaurant_id);
  update public.visits set status = 'paid', paid_at = now(), paid_by = auth.uid(), invoice_no = inv,
         paid_method = case when array_length(methods, 1) = 1 then methods[1] else 'mixed' end,
         subtotal = (b ->> 'subtotal')::numeric, discount = (b ->> 'discount')::numeric, service = (b ->> 'service')::numeric,
         gst = (b ->> 'gst')::numeric, tip = (b ->> 'tip')::numeric, total = grand
   where id = p_visit;
  insert into public.payments (restaurant_id, visit_id, method, amount, reference, created_by)
  select v.restaurant_id, p_visit, x ->> 'method', round((x ->> 'amount')::numeric, 2), trim(coalesce(x ->> 'reference', '')), auth.uid()
    from jsonb_array_elements(p_parts) with ordinality as t(x, i) order by i;
  if v.kind = 'dine_in' then
    update public.orders set status = 'served', served_at = coalesce(served_at, now()) where visit_id = p_visit and status = 'ready';
    update public.calls set done_at = now() where table_id = v.table_id and done_at is null;
  end if;
  perform public.log_it('bill_paid', public.visit_label(v) || ' · ' || inv || ' · ' || detail || ' · ₹' || grand || refs);
  return public.visit_bill(p_visit) || jsonb_build_object('invoice_no', inv);
end $$;

-- -----------------------------------------------------------------------------
-- The printed bill. Before payment it is a pre-bill (no invoice number).
-- -----------------------------------------------------------------------------
create or replace function public.receipt_json(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.visits; s public.settings; b jsonb; g numeric; c numeric;
begin
  select * into v from public.visits where id = p_visit;
  if not found then return null; end if;
  select * into s from public.settings where restaurant_id = v.restaurant_id;
  b := public.visit_bill(p_visit);
  g := coalesce((b ->> 'gst')::numeric, 0); c := round(g / 2, 2);
  return jsonb_build_object(
    'place', jsonb_build_object('name', s.restaurant_name, 'legal_name', coalesce(nullif(s.legal_name, ''), s.restaurant_name),
       'address', s.bill_address, 'gstin', s.gstin, 'fssai', s.fssai, 'sac', s.sac, 'composition', s.gst_composition,
       'footer', s.bill_footer, 'width', s.receipt_width, 'currency', s.currency),
    'status', v.status, 'invoice_no', v.invoice_no, 'at', coalesce(v.paid_at, now()), 'opened_at', v.opened_at,
    'label', public.visit_label(v), 'kind', v.kind, 'guests', v.guests,
    'by', (select nullif(name, '') from public.memberships where user_id = v.paid_by and restaurant_id = v.restaurant_id),
    'lines', coalesce((select jsonb_agg(l || jsonb_build_object('unit', round((l ->> 'amount')::numeric / nullif((l ->> 'qty')::numeric, 0), 2)))
                         from jsonb_array_elements(b -> 'lines') l), '[]'),
    'bill', b, 'taxable', (b ->> 'subtotal')::numeric - coalesce((b ->> 'discount')::numeric, 0) + coalesce((b ->> 'service')::numeric, 0),
    'cgst', c, 'sgst', g - c,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', amount, 'reference', reference) order by created_at)
                            from public.payments where visit_id = p_visit), '[]'));
end $$;

create or replace function public.staff_receipt(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.need(public.is_floor());
  if not exists (select 1 from public.visits where id = p_visit and restaurant_id = public.my_restaurant() and status <> 'void') then
    raise exception 'That bill is gone.';
  end if;
  return public.receipt_json(p_visit);
end $$;

-- Guests: their last paid bill now carries its receipt (still within two hours of paying)
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
        'total', last_paid.total, 'reviewed', exists (select 1 from public.reviews where visit_id = last_paid.id),
        'receipt', public.receipt_json(last_paid.id) - 'by') end);
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

create or replace function public.staff_bills(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_floor());
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'table', public.visit_label(v), 'kind', v.kind, 'invoice_no', v.invoice_no,
      'opened_at', v.opened_at, 'paid_at', v.paid_at,
      'status', v.status, 'method', v.paid_method, 'total', v.total, 'tip', v.tip, 'discount', v.discount, 'gst', v.gst, 'guests', v.guests, 'void_reason', v.void_reason,
      'by', (select name from public.memberships where user_id = v.paid_by and restaurant_id = rid), 'bill', public.visit_bill(v.id),
      'ref', (select string_agg(nullif(p.reference, ''), ', ') from public.payments p where p.visit_id = v.id),
      'stars', (select stars from public.reviews where visit_id = v.id)) order by coalesce(v.paid_at, v.opened_at) desc)
    from public.visits v
   where v.restaurant_id = rid and v.status in ('paid', 'void')
     and (coalesce(v.paid_at, v.opened_at) at time zone 'Asia/Kolkata')::date between p_from and p_to), '[]');
end $$;

-- -----------------------------------------------------------------------------
-- Settings: the bill details (owner only, like every setting but pausing orders)
-- -----------------------------------------------------------------------------
create or replace function public.owner_save_bill_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant(); g text := upper(trim(coalesce(p ->> 'gstin', ''))); comp boolean;
begin
  perform public.need(public.is_owner());
  if g <> '' and g !~ '^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$' then raise exception 'Check the GSTIN: 15 characters, like 27ABCDE1234F1Z5.'; end if;
  if trim(coalesce(p ->> 'fssai', '')) !~ '^([0-9]{14})?$' then raise exception 'The FSSAI licence number has 14 digits.'; end if;
  if upper(trim(coalesce(p ->> 'invoice_prefix', ''))) !~ '^[A-Z0-9]{0,5}$' then raise exception 'Use up to 5 letters or numbers for the bill number prefix.'; end if;
  if coalesce(p ->> 'sac', '996331') !~ '^[0-9]{4,8}$' then raise exception 'The SAC code is 4 to 8 digits (996331 for restaurants).'; end if;
  if p ? 'receipt_width' and (p ->> 'receipt_width') not in ('58', '80') then raise exception 'Pick 58 or 80 mm paper.'; end if;
  comp := coalesce((p ->> 'gst_composition')::boolean, (select gst_composition from public.settings where restaurant_id = rid));
  if comp and (select gst_pct from public.settings where restaurant_id = rid) > 0 then
    raise exception 'Restaurants in the GST composition scheme can''t charge GST. Set GST to 0 %% first.';
  end if;
  update public.settings set
    legal_name = left(trim(coalesce(p ->> 'legal_name', legal_name)), 120),
    bill_address = left(trim(coalesce(p ->> 'bill_address', bill_address)), 300),
    gstin = case when p ? 'gstin' then g else gstin end,
    fssai = coalesce(trim(p ->> 'fssai'), fssai),
    sac = coalesce(nullif(trim(p ->> 'sac'), ''), sac),
    gst_composition = comp,
    invoice_prefix = coalesce(upper(trim(p ->> 'invoice_prefix')), invoice_prefix),
    bill_footer = left(coalesce(p ->> 'bill_footer', bill_footer), 160),
    receipt_width = coalesce((p ->> 'receipt_width')::int, receipt_width),
    updated_at = now()
   where restaurant_id = rid;
  perform public.log_it('bill_settings_changed', case when p ? 'gstin' then 'GSTIN ' || coalesce(nullif(g, ''), 'removed') else '' end);
end $$;

-- GST can't be turned on while the composition scheme is ticked
create or replace function public.settings_composition_ok() returns trigger
language plpgsql as $$ begin
  if new.gst_composition and new.gst_pct > 0 then
    raise exception 'Restaurants in the GST composition scheme can''t charge GST. Set GST to 0 %% first.';
  end if;
  return new;
end $$;
drop trigger if exists b_composition on public.settings;
create trigger b_composition before update on public.settings for each row execute function public.settings_composition_ok();

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke execute on function public.fy_code(date), public.next_invoice(uuid), public.receipt_json(uuid) from public, anon, authenticated;
grant execute on function public.staff_receipt(uuid), public.owner_save_bill_settings(jsonb) to authenticated;
