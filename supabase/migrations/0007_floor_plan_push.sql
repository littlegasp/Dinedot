-- =============================================================================
-- 0007 · Floor plan and phone alerts. Run after 0001–0006.
--
-- * Floor plan: each table remembers where it stands on its area's plan (plan_x 0–1000,
--   plan_y 0–640, the plan's own units) and its shape (square, round, long). Managers arrange
--   the plan on Tables & QR (owner_save_plan); Floor shows it live. Tables not placed yet are
--   laid out by the app until someone saves.
-- * Phone alerts with the app closed (web push, same design as Vroombrite): the "push" edge
--   function makes its own key pair and keeps it in push_config (service role only); each phone
--   is a push_subs row. New orders alert the kitchen; calls from tables alert floor staff;
--   orders that are ready alert waiters and cashiers. The database asks the function through
--   pg_net with a secret; nothing waits for it and an order never fails because of it.
-- Guests still run exactly the six guest_* functions. Nothing is deleted.
-- =============================================================================

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Floor plan
-- -----------------------------------------------------------------------------
alter table public.dining_tables
  add column if not exists plan_x int check (plan_x between 0 and 1000),
  add column if not exists plan_y int check (plan_y between 0 and 640),
  add column if not exists shape  text not null default 'square' check (shape in ('square', 'round', 'long'));

create or replace function public.owner_save_table(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_manager());
  if coalesce(p ->> 'shape', 'square') not in ('square', 'round', 'long') then raise exception 'Pick square, round or long.'; end if;
  if v_id is null then
    insert into public.dining_tables (restaurant_id, code, name, area, seats, sort, active, shape)
    values (rid, upper(trim(p ->> 'code')), coalesce(p ->> 'name', ''), coalesce(nullif(trim(p ->> 'area'), ''), 'Main'),
            coalesce((p ->> 'seats')::int, 4), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.dining_tables where restaurant_id = rid)),
            coalesce((p ->> 'active')::boolean, true), coalesce(p ->> 'shape', 'square'))
    returning id into v_id;
  else
    update public.dining_tables set code = upper(trim(p ->> 'code')), name = coalesce(p ->> 'name', ''), area = coalesce(nullif(trim(p ->> 'area'), ''), 'Main'),
      seats = coalesce((p ->> 'seats')::int, seats), sort = coalesce((p ->> 'sort')::int, sort), active = coalesce((p ->> 'active')::boolean, active),
      shape = coalesce(p ->> 'shape', shape),
      -- a table moved to another area starts unplaced there
      plan_x = case when area is distinct from coalesce(nullif(trim(p ->> 'area'), ''), 'Main') then null else plan_x end,
      plan_y = case when area is distinct from coalesce(nullif(trim(p ->> 'area'), ''), 'Main') then null else plan_y end
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That table is gone.'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Another table already uses that number.';
end $$;

-- p = [{id, x, y}, …]; only this restaurant's tables move
create or replace function public.owner_save_plan(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.need(public.is_manager());
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 300 then raise exception 'Check the plan.'; end if;
  if exists (select 1 from jsonb_array_elements(p) e where (e ->> 'x')::int not between 0 and 1000 or (e ->> 'y')::int not between 0 and 640) then
    raise exception 'A table is outside the plan.';
  end if;
  update public.dining_tables t set plan_x = (e ->> 'x')::int, plan_y = (e ->> 'y')::int
    from jsonb_array_elements(p) e where t.id = (e ->> 'id')::uuid and t.restaurant_id = public.my_restaurant();
  get diagnostics n = row_count;
  if n > 0 then perform public.log_it('plan_saved', n || ' table' || case when n = 1 then '' else 's' end); end if;
  return n;
end $$;

-- Tables now carry their place on the plan
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
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'area', area, 'seats', seats, 'active', active,
                          'x', plan_x, 'y', plan_y, 'shape', shape)
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


-- -----------------------------------------------------------------------------
-- Phone alerts (web push)
-- -----------------------------------------------------------------------------
create table if not exists public.push_config (
  id          int primary key default 1 check (id = 1),
  public_key  text,
  private_key text,
  hook_secret text not null default md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text),
  fn_url      text not null default ''   -- the push function's address, filled in below
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;
-- The live project's push function. A new install sets its own: update push_config set fn_url = 'https://<ref>.supabase.co/functions/v1/push';
update public.push_config set fn_url = 'https://amthbdgwonzgesxrphxc.supabase.co/functions/v1/push' where id = 1 and fn_url = '';

create table if not exists public.push_subs (
  id            bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null,
  endpoint      text not null unique check (endpoint ~ '^https://'),
  p256dh        text not null,
  auth          text not null,
  device        text not null default '' check (length(device) <= 60),
  created_at    timestamptz not null default now()
);
create index if not exists push_subs_restaurant on public.push_subs (restaurant_id);
alter table public.push_config enable row level security;
alter table public.push_subs enable row level security;
revoke all on public.push_config, public.push_subs from anon, authenticated;
create trigger a_restaurant_id before insert or update on public.push_subs for each row execute function public.set_restaurant_id();

-- a login removed from a team stops getting that restaurant's alerts
create or replace function public.push_drop_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subs where restaurant_id = old.restaurant_id and user_id = old.user_id;
  return null;
end $$;
drop trigger if exists push_drop_member on public.memberships;
create trigger push_drop_member after delete on public.memberships for each row execute function public.push_drop_member();

create or replace function public.staff_push_subscribe(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := public.my_restaurant();
begin
  perform public.need(public.is_staff());
  if coalesce(p ->> 'endpoint', '') !~ '^https://' or coalesce(p ->> 'p256dh', '') = '' or coalesce(p ->> 'auth', '') = '' then
    raise exception 'This phone''s alert details look wrong. Try again.';
  end if;
  insert into public.push_subs (restaurant_id, user_id, endpoint, p256dh, auth, device)
  values (rid, auth.uid(), p ->> 'endpoint', p ->> 'p256dh', p ->> 'auth', left(coalesce(p ->> 'device', ''), 60))
  on conflict (endpoint) do update set restaurant_id = excluded.restaurant_id, user_id = excluded.user_id,
    p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device;
  return jsonb_build_object('ok', true, 'devices', (select count(*) from public.push_subs where user_id = auth.uid() and restaurant_id = rid));
end $$;

create or replace function public.staff_push_unsubscribe(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_staff());
  delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- For the edge function only (service key) ---------------------------------------
create or replace function public.push_keys() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('public_key', public_key, 'private_key', private_key) from public.push_config where id = 1;
$$;
create or replace function public.push_save_keys(p_public text, p_private text) returns jsonb
language sql security definer set search_path = public as $$
  update public.push_config set public_key = coalesce(public_key, p_public), private_key = coalesce(private_key, p_private) where id = 1
  returning jsonb_build_object('public_key', public_key);
$$;
create or replace function public.push_drop(p_endpoints text[]) returns void
language sql security definer set search_path = public as $$ delete from public.push_subs where endpoint = any (p_endpoints); $$;
create or replace function public.push_user_subs(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]') from public.push_subs where user_id = p_user;
$$;

-- What to send and to whom, for an event the database reported (only with the right secret).
-- kind order: kitchen · call: owner, manager, cashier, waiter · ready: cashier, waiter. Switched-off logins get nothing.
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
  else return null;
  end if;
  return jsonb_build_object('title', title, 'body', left(coalesce(body, ''), 160), 'url', url, 'tag', p_kind || '-' || p_id,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]')
               from public.push_subs s join public.memberships m on m.user_id = s.user_id and m.restaurant_id = s.restaurant_id
              where s.restaurant_id = rid and m.active and m.role = any (roles)));
end $$;

-- The database tells the push function; any failure is ignored (an order never waits for an alert)
do $$ begin
  begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pg_net not available here: %', sqlerrm; end;
end $$;
create or replace function public.push_send(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cfg public.push_config;
begin
  select * into cfg from public.push_config where id = 1;
  if cfg.fn_url = '' or cfg.public_key is null or to_regproc('net.http_post') is null then return; end if;   -- not set up yet: nothing to do
  if not exists (select 1 from public.push_subs) then return; end if;
  begin
    perform net.http_post(url := cfg.fn_url, body := jsonb_build_object('kind', p_kind, 'id', p_id, 'secret', cfg.hook_secret),
                          headers := '{"Content-Type": "application/json"}'::jsonb);
  exception when others then null;
  end;
end $$;

create or replace function public.push_on_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then perform public.push_send('order', new.id);
  elsif new.status = 'ready' and old.status is distinct from 'ready' then perform public.push_send('ready', new.id);
  end if;
  return null;
end $$;
drop trigger if exists push_on_order on public.orders;
create trigger push_on_order after insert or update of status on public.orders for each row execute function public.push_on_order();

create or replace function public.push_on_call() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.push_send('call', new.id); return null; end $$;
drop trigger if exists push_on_call on public.calls;
create trigger push_on_call after insert on public.calls for each row execute function public.push_on_call();

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke execute on function public.push_keys(), public.push_save_keys(text, text), public.push_drop(text[]), public.push_user_subs(uuid),
  public.push_hook(text, uuid, text), public.push_send(text, uuid), public.push_on_order(), public.push_on_call(), public.push_drop_member()
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_keys(), public.push_save_keys(text, text), public.push_drop(text[]), public.push_user_subs(uuid),
      public.push_hook(text, uuid, text) to service_role;
  end if;
end $$;
grant execute on function public.owner_save_plan(jsonb), public.staff_push_subscribe(jsonb), public.staff_push_unsubscribe(text) to authenticated;
