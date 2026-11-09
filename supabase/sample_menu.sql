-- Optional: a sample menu and six tables, so a new setup has something to try.
-- Run AFTER 0001_init.sql, in the SQL Editor. Delete or edit the dishes later in the staff app (Menu).
insert into public.categories (id, name, sort) values
  ('00000000-0000-4000-8000-000000000001', 'Starters', 1),
  ('00000000-0000-4000-8000-000000000002', 'Mains', 2),
  ('00000000-0000-4000-8000-000000000003', 'Breads & Rice', 3),
  ('00000000-0000-4000-8000-000000000004', 'Drinks', 4),
  ('00000000-0000-4000-8000-000000000005', 'Desserts', 5)
on conflict do nothing;

insert into public.items (category_id, name, description, price, diet, spice, allergens, sizes, addons, bestseller, sort) values
  ('00000000-0000-4000-8000-000000000001', 'Paneer Tikka', 'Charred cottage cheese, peppers and onion, mint chutney', 290, 'veg', 2, '{Dairy}', '[]', '[{"name":"Extra chutney","price":20}]', true, 1),
  ('00000000-0000-4000-8000-000000000001', 'Chicken Seekh Kebab', 'Minced chicken, ginger and green chilli, off the grill', 340, 'nonveg', 3, '{}', '[]', '[]', false, 2),
  ('00000000-0000-4000-8000-000000000001', 'Crispy Corn', 'Sweetcorn tossed with pepper, garlic and spring onion', 220, 'veg', 1, '{}', '[]', '[]', false, 3),
  ('00000000-0000-4000-8000-000000000002', 'Chicken Karahi', 'Slow-cooked with tomato, ginger and green chilli', 420, 'nonveg', 3, '{Dairy}', '[{"name":"Half","price":260},{"name":"Full","price":420}]', '[]', true, 1),
  ('00000000-0000-4000-8000-000000000002', 'Dal Makhani', 'Black lentils simmered overnight with butter and cream', 280, 'veg', 1, '{Dairy}', '[]', '[{"name":"Extra butter","price":30}]', true, 2),
  ('00000000-0000-4000-8000-000000000002', 'Egg Curry', 'Boiled eggs in onion-tomato masala', 240, 'egg', 2, '{}', '[]', '[]', false, 3),
  ('00000000-0000-4000-8000-000000000003', 'Butter Naan', 'Tandoor-baked, brushed with butter', 60, 'veg', null, '{Gluten,Dairy}', '[]', '[{"name":"Garlic","price":15}]', false, 1),
  ('00000000-0000-4000-8000-000000000003', 'Jeera Rice', 'Basmati with cumin and ghee', 180, 'veg', null, '{Dairy}', '[]', '[]', false, 2),
  ('00000000-0000-4000-8000-000000000004', 'Mint Lemonade', 'Fresh lime, mint and soda', 120, 'veg', null, '{}', '[{"name":"Glass","price":120},{"name":"Jug","price":320}]', '[]', false, 1),
  ('00000000-0000-4000-8000-000000000004', 'Masala Chaas', 'Spiced buttermilk', 90, 'veg', null, '{Dairy}', '[]', '[]', false, 2),
  ('00000000-0000-4000-8000-000000000005', 'Gulab Jamun', 'Two warm dumplings in rose syrup', 140, 'veg', null, '{Dairy,Gluten,Nuts}', '[]', '[{"name":"Vanilla scoop","price":60}]', false, 1);

insert into public.dining_tables (code, area, seats, sort) values
  ('T1', 'Main', 4, 1), ('T2', 'Main', 4, 2), ('T3', 'Main', 2, 3),
  ('T4', 'Main', 6, 4), ('T5', 'Terrace', 4, 5), ('T6', 'Terrace', 4, 6)
on conflict do nothing;
