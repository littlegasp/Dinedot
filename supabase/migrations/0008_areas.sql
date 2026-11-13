-- =============================================================================
-- 0008 · Areas. Run after 0001–0007.
--
-- Each restaurant keeps its own list of areas (Main, Rooftop, AC Hall…): its order, the shape
-- of the room on the floor plan (wide, square or long) and simple markers placed on it
-- (entrance, counter, kitchen, washroom, window, stairs, pillar).
-- * Tables still carry their area's name (dining_tables.area). Saving a table with a name that
--   differs only in capitals or spaces uses the area that already exists ("terrace " → "Terrace");
--   a new name adds the area. Renaming an area renames it on its tables too.
-- * An area can be deleted only when no table is in it.
-- * owner_save_room saves a room's table places and markers in one go.
-- Guests still run exactly the six guest_* functions. Nothing is deleted.
-- =============================================================================

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

create table if not exists public.areas (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name          text not null check (length(name) between 1 and 30 and name = btrim(name)),
  sort          int  not null default 0,
  shape         text not null default 'wide' check (shape in ('wide', 'square', 'long')),
  marks         jsonb not null default '[]' check (jsonb_typeof(marks) = 'array' and jsonb_array_length(marks) <= 40),
  created_at    timestamptz not null default now()
);
create unique index if not exists areas_name on public.areas (restaurant_id, lower(name));
alter table public.areas enable row level security;
revoke all on public.areas from anon, authenticated;
create trigger a_restaurant_id before insert or update on public.areas for each row execute function public.set_restaurant_id();

-- The areas the restaurants already use, in the order their tables come
insert into public.areas (restaurant_id, name, sort)
select restaurant_id, area, (row_number() over (partition by restaurant_id order by min(sort), area))::int
  from public.dining_tables where btrim(area) <> '' group by restaurant_id, area
on conflict do nothing;

-- Room size on the plan (the plan's own units)
create or replace function public.area_room(p_shape text) returns int[]
language sql immutable as $$
  select case p_shape when 'square' then array[640, 640] when 'long' then array[1000, 400] else array[1000, 640] end
$$;

create or replace function public.check_marks(p jsonb, p_shape text) returns jsonb
language plpgsql immutable as $$
declare r int[] := public.area_room(p_shape);
begin
  p := coalesce(p, '[]');
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 40 then raise exception 'Too many markers in one area.'; end if;
  if exists (select 1 from jsonb_array_elements(p) e
              where coalesce(e ->> 'k', '') not in ('entrance', 'counter', 'kitchen', 'washroom', 'window', 'stairs', 'pillar')) then
    raise exception 'That marker isn''t one we know.';
  end if;
  if exists (select 1 from jsonb_array_elements(p) e
              where (e ->> 'x')::int not between 0 and r[1] or (e ->> 'y')::int not between 0 and r[2]) then
    raise exception 'A marker is outside the room.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('k', e ->> 'k', 'x', (e ->> 'x')::int, 'y', (e ->> 'y')::int)), '[]') from jsonb_array_elements(p) e);
end $$;

-- Every table's area is one of the restaurant's areas: same spelling as the area, or a new area
create or replace function public.table_area() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.areas;
begin
  new.area := coalesce(nullif(regexp_replace(btrim(coalesce(new.area, '')), '\s+', ' ', 'g'), ''), 'Main');
  if length(new.area) > 30 then raise exception 'Keep the area name to 30 letters.'; end if;
  select * into a from public.areas where restaurant_id = new.restaurant_id and lower(name) = lower(new.area);
  if found then new.area := a.name;
  else
    insert into public.areas (restaurant_id, name, sort)
    values (new.restaurant_id, new.area, (select coalesce(max(sort), 0) + 1 from public.areas where restaurant_id = new.restaurant_id));
  end if;
  return new;
end $$;
-- runs after a_restaurant_id (triggers run in name order), so restaurant_id is set
create trigger b_area before insert or update of area on public.dining_tables for each row execute function public.table_area();
-- tables whose area differs from its area's spelling ("terrace" next to "Terrace") take the area's spelling
update public.dining_tables t set area = area
 where not exists (select 1 from public.areas a where a.restaurant_id = t.restaurant_id and a.name = t.area);

-- Same as 0007, but a table only loses its place when it really moves to another area
-- ("terrace" and "Terrace" are the same area)
create or replace function public.owner_save_table(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; rid uuid := public.my_restaurant();
        v_area text := coalesce(nullif(regexp_replace(btrim(coalesce(p ->> 'area', '')), '\s+', ' ', 'g'), ''), 'Main');
begin
  perform public.need(public.is_manager());
  if coalesce(p ->> 'shape', 'square') not in ('square', 'round', 'long') then raise exception 'Pick square, round or long.'; end if;
  if v_id is null then
    insert into public.dining_tables (restaurant_id, code, name, area, seats, sort, active, shape)
    values (rid, upper(trim(p ->> 'code')), coalesce(p ->> 'name', ''), v_area,
            coalesce((p ->> 'seats')::int, 4), coalesce((p ->> 'sort')::int, (select coalesce(max(sort), 0) + 1 from public.dining_tables where restaurant_id = rid)),
            coalesce((p ->> 'active')::boolean, true), coalesce(p ->> 'shape', 'square'))
    returning id into v_id;
  else
    update public.dining_tables set code = upper(trim(p ->> 'code')), name = coalesce(p ->> 'name', ''), area = v_area,
      seats = coalesce((p ->> 'seats')::int, seats), sort = coalesce((p ->> 'sort')::int, sort), active = coalesce((p ->> 'active')::boolean, active),
      shape = coalesce(p ->> 'shape', shape),
      plan_x = case when lower(area) <> lower(v_area) then null else plan_x end,
      plan_y = case when lower(area) <> lower(v_area) then null else plan_y end
     where id = v_id and restaurant_id = rid;
    if not found then raise exception 'That table is gone.'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Another table already uses that number.';
end $$;

-- p = {id?, name, shape?}; returns the area id
create or replace function public.owner_save_area(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid; rid uuid := public.my_restaurant(); old public.areas;
        v_name text := regexp_replace(btrim(coalesce(p ->> 'name', '')), '\s+', ' ', 'g'); v_shape text;
begin
  perform public.need(public.is_manager());
  if v_name = '' then raise exception 'Give the area a name.'; end if;
  if length(v_name) > 30 then raise exception 'Keep the area name to 30 letters.'; end if;
  if v_id is null then
    v_shape := coalesce(nullif(p ->> 'shape', ''), 'wide');
    if v_shape not in ('wide', 'square', 'long') then raise exception 'Pick wide, square or long.'; end if;
    insert into public.areas (restaurant_id, name, shape, sort)
    values (rid, v_name, v_shape, (select coalesce(max(sort), 0) + 1 from public.areas where restaurant_id = rid))
    returning id into v_id;
    perform public.log_it('area_added', v_name);
  else
    select * into old from public.areas where id = v_id and restaurant_id = rid for update;
    if not found then raise exception 'That area is gone.'; end if;
    v_shape := coalesce(nullif(p ->> 'shape', ''), old.shape);
    if v_shape not in ('wide', 'square', 'long') then raise exception 'Pick wide, square or long.'; end if;
    -- markers that no longer fit a smaller room come in to its edge
    update public.areas set name = v_name, shape = v_shape,
      marks = case when v_shape = old.shape then marks else
        (select coalesce(jsonb_agg(jsonb_build_object('k', e ->> 'k',
                   'x', least((e ->> 'x')::int, (public.area_room(v_shape))[1] - 30), 'y', least((e ->> 'y')::int, (public.area_room(v_shape))[2] - 30))), '[]')
           from jsonb_array_elements(marks) e) end
     where id = v_id;
    if v_name <> old.name then
      update public.dining_tables set area = v_name where restaurant_id = rid and area = old.name;
      perform public.log_it('area_renamed', old.name || ' → ' || v_name);
    end if;
    if v_shape <> old.shape then
      update public.dining_tables set plan_x = least(plan_x, (public.area_room(v_shape))[1] - 50), plan_y = least(plan_y, (public.area_room(v_shape))[2] - 50)
       where restaurant_id = rid and area = v_name and plan_x is not null;
    end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'There''s already an area called %.', v_name;
end $$;

create or replace function public.owner_delete_area(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.areas; n int;
begin
  perform public.need(public.is_manager());
  select * into a from public.areas where id = p_id and restaurant_id = public.my_restaurant() for update;
  if not found then return; end if;
  select count(*) into n from public.dining_tables where restaurant_id = a.restaurant_id and area = a.name;
  if n > 0 then raise exception 'Move its % table% to another area first.', n, case when n = 1 then '' else 's' end; end if;
  delete from public.areas where id = a.id;
  perform public.log_it('area_deleted', a.name);
end $$;

-- p_ids = the areas in their new order
create or replace function public.owner_sort_areas(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.need(public.is_manager());
  update public.areas a set sort = x.n from unnest(p_ids) with ordinality x(id, n)
   where a.id = x.id and a.restaurant_id = public.my_restaurant();
end $$;

-- p = {area_id, tables: [{id, x, y}], marks: [{k, x, y}]}; the room's places and markers in one go
create or replace function public.owner_save_room(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare a public.areas; r int[]; n int;
begin
  perform public.need(public.is_manager());
  select * into a from public.areas where id = nullif(p ->> 'area_id', '')::uuid and restaurant_id = public.my_restaurant() for update;
  if not found then raise exception 'That area is gone.'; end if;
  r := public.area_room(a.shape);
  if jsonb_typeof(coalesce(p -> 'tables', '[]')) <> 'array' or jsonb_array_length(coalesce(p -> 'tables', '[]')) > 300 then raise exception 'Check the plan.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p -> 'tables', '[]')) e
              where (e ->> 'x')::int not between 0 and r[1] or (e ->> 'y')::int not between 0 and r[2]) then
    raise exception 'A table is outside the room.';
  end if;
  update public.areas set marks = public.check_marks(p -> 'marks', a.shape) where id = a.id;
  update public.dining_tables t set plan_x = (e ->> 'x')::int, plan_y = (e ->> 'y')::int
    from jsonb_array_elements(coalesce(p -> 'tables', '[]')) e
   where t.id = (e ->> 'id')::uuid and t.restaurant_id = a.restaurant_id and t.area = a.name;
  get diagnostics n = row_count;
  perform public.log_it('plan_saved', a.name || ': ' || n || ' table' || case when n = 1 then '' else 's' end
                        || ', ' || jsonb_array_length(public.check_marks(p -> 'marks', a.shape)) || ' markers');
  return n;
end $$;

-- staff_live also lists the areas (order, room shape, markers)
do $$ declare src text; begin
  select pg_get_functiondef('public.staff_live()'::regprocedure) into src;
  if position('''areas''' in src) = 0 then
    src := replace(src, $q$    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id,$q$,
      $q$    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'shape', shape, 'marks', marks) order by sort, name)
                          from public.areas where restaurant_id = rid), '[]'),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id', v.id,$q$);
    if position('''areas''' in src) = 0 then raise exception '0008: couldn''t add areas to staff_live'; end if;
    execute src;
  end if;
end $$;

revoke execute on function public.area_room(text), public.check_marks(jsonb, text), public.table_area() from public, anon, authenticated;
grant execute on function public.owner_save_area(jsonb), public.owner_delete_area(uuid), public.owner_sort_areas(uuid[]),
  public.owner_save_room(jsonb) to authenticated;
