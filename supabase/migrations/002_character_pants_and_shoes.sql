-- Pants color and shoes on characters.

alter table public.characters add column if not exists pants_color text not null default '#3A3A3A';
alter table public.characters add column if not exists shoe text not null default 'sneakers';
alter table public.characters add column if not exists shoe_color text not null default '#111111';

insert into public.game_assets (key, kind, name, city_tier, r2_key) values
  ('shoe.sneakers', 'other', 'Sneakers', 1, 'clothing/sneakers.png'),
  ('shoe.boots', 'other', 'Boots', 1, 'clothing/boots.png'),
  ('shoe.slides', 'other', 'Slides', 1, 'clothing/slides.png'),
  ('shoe.loafers', 'other', 'Loafers', 2, 'clothing/loafers.png')
on conflict (key) do nothing;
