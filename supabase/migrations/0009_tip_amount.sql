-- =============================================================================
-- 0009 · A tip as an amount. Run after 0001–0008.
--
-- Guests (and staff) can give the tip as a rupee amount (₹50) instead of a percentage.
-- * visits.tip_amount: when above 0 it is the tip; otherwise the tip is tip_pct % of the net
--   (as before). Choosing a percentage clears the amount and the other way round.
-- * guest_bill takes p_tip_amount (default 0, so a page that doesn't send it works as before).
--   An amount tip can't be more than the bill itself.
-- * staff_visit_update takes p_tip_amount (default: leave it); a new percentage clears it.
-- * The bill shows 'tip_amount'. A paid bill keeps its frozen tip as before.
-- Guests still run exactly the six guest_* functions. Nothing is deleted.
-- =============================================================================

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

alter table public.visits add column if not exists tip_amount numeric(10,2) not null default 0 check (tip_amount between 0 and 100000);

-- Same as 0005, with the amount tip
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
      'total', v.total - v.tip, 'grand', v.total, 'split', v.split, 'each', ceil(v.total / v.split), 'tip_pct', v.tip_pct, 'tip_amount', v.tip_amount,
      'service_pct', s.service_pct, 'gst_pct', s.gst_pct, 'payments', pays);
  end if;
  disc := case v.discount_kind when 'pct' then round(sub * v.discount_value / 100, 2) when 'amount' then least(v.discount_value, sub) else 0 end;
  net := sub - disc;
  svc := round(net * s.service_pct / 100, 2);
  tax := round((net + svc) * s.gst_pct / 100, 2);
  tot := round(net + svc + tax);
  tp  := case when v.tip_amount > 0 then round(v.tip_amount) else round(net * v.tip_pct / 100) end;
  return jsonb_build_object('lines', lines, 'subtotal', sub, 'discount', disc, 'discount_kind', v.discount_kind,
    'discount_value', v.discount_value, 'discount_reason', v.discount_reason, 'service', svc, 'gst', tax, 'tip', tp, 'total', tot,
    'grand', tot + tp, 'split', v.split, 'each', ceil((tot + tp) / v.split), 'tip_pct', v.tip_pct, 'tip_amount', v.tip_amount,
    'service_pct', s.service_pct, 'gst_pct', s.gst_pct);
end $$;

-- The activity log also notes an amount tip
create or replace function public.audit_visits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.status not in ('open', 'bill') then return null; end if;
  if old.split is distinct from new.split or old.tip_pct is distinct from new.tip_pct or old.tip_amount is distinct from new.tip_amount then
    perform public.log_at(new.restaurant_id, 'bill_changed', public.visit_label(new) || ' · split ' || old.split || '→' || new.split
                          || ' · tip ' || case when old.tip_amount > 0 then '₹' || round(old.tip_amount) else old.tip_pct || '%' end
                          || '→' || case when new.tip_amount > 0 then '₹' || round(new.tip_amount) else new.tip_pct || '%' end);
  end if;
  return null;
end $$;

-- Guests: a tip option %, or an amount
drop function if exists public.guest_bill(text, int, numeric, text);
create function public.guest_bill(p_token text, p_split int, p_tip_pct numeric, p_pay text, p_tip_amount numeric default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.dining_tables; v public.visits; tips int[]; amt numeric := round(coalesce(p_tip_amount, 0)); b jsonb;
begin
  t := public.table_by_token(p_token);
  select * into v from public.visits where table_id = t.id and status in ('open', 'bill') for update;
  if not found then raise exception 'There''s no open bill for this table.'; end if;
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

-- Staff: a new % clears an amount tip; p_tip_amount (when sent) sets one
drop function if exists public.staff_visit_update(uuid, int, numeric, int);
create function public.staff_visit_update(p_visit uuid, p_split int, p_tip_pct numeric, p_guests int, p_tip_amount numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.visits; amt numeric := round(p_tip_amount);
begin
  perform public.need(public.is_floor());
  select * into v from public.visits where id = p_visit and restaurant_id = public.my_restaurant() and status in ('open', 'bill') for update;
  if not found then raise exception 'This table''s bill is already closed.'; end if;
  if amt is not null and (amt < 0 or amt > 100000) then raise exception 'Check the tip amount.'; end if;
  update public.visits set split = greatest(1, least(coalesce(p_split, split), 20)),
         tip_amount = case when amt is not null then amt
                           when p_tip_pct is not null and p_tip_pct is distinct from v.tip_pct then 0 else tip_amount end,
         tip_pct = case when amt > 0 then 0 else greatest(0, least(coalesce(p_tip_pct, tip_pct), 30)) end,
         guests = coalesce(case when p_guests between 1 and 40 then p_guests end, guests)
   where id = v.id;
  return public.visit_bill(p_visit);
end $$;

grant execute on function public.guest_bill(text, int, numeric, text, numeric) to anon, authenticated;
grant execute on function public.staff_visit_update(uuid, int, numeric, int, numeric) to authenticated;
