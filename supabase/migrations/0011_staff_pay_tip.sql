-- =============================================================================
-- 0011 · Staff see what the guest sees: the restaurant's tip choices and payment methods,
--        and how a table that asked for the bill is going to pay. Run after 0001–0010.
-- * staff_live.settings gets 'tip_options' and 'pay' (upi / card / cash on or off, UPI only
--   with a UPI ID), so the POS shows the same choices as the guest's phone.
-- * The phone alert for "asked for the bill" says how they'll pay and how much.
-- Nothing new for guests. Nothing is deleted.
-- =============================================================================

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

create or replace function public.pay_word(p text) returns text
language sql immutable as $$ select case p when 'upi' then 'Pays by UPI / QR' when 'card' then 'Pays by card' when 'cash' then 'Pays in cash' else '' end $$;

do $$ declare src text; begin
  select pg_get_functiondef('public.staff_live()'::regprocedure) into src;
  if position('''tip_options''' in src) = 0 then
    src := replace(src, $q$'stations', to_jsonb(stations), 'max_discount_pct', max_discount_pct,$q$,
      $q$'stations', to_jsonb(stations), 'max_discount_pct', max_discount_pct,
                   'tip_options', to_jsonb(tip_options),
                   'pay', jsonb_build_object('upi', pay_upi and upi_id <> '', 'card', pay_card, 'cash', pay_cash),$q$);
    if position('''tip_options''' in src) = 0 then raise exception '0011: couldn''t add tip choices to staff_live'; end if;
    execute src;
  end if;
end $$;

-- Same as 0010, with how a table that asked for the bill will pay
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
    if c.kind = 'bill' then   -- 0011: how they'll pay, so the waiter brings the right thing
      select * into v from public.visits where id = c.visit_id;
      if found then
        body := coalesce(nullif(public.pay_word(v.pay_choice), ''), 'Bill') || ' · ₹' || ((public.visit_bill(v.id) ->> 'grand')::numeric)::text
                || case when v.split > 1 then ' · ' || v.split || ' ways' else '' end;
      end if;
    end if;
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

revoke execute on function public.pay_word(text) from public, anon, authenticated;
