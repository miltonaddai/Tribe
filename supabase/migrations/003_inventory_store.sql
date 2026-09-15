-- Inventory / store fields on characters.
-- Safe to re-run.

alter table public.characters
  add column if not exists credits numeric(12, 2) not null default 500;

alter table public.characters
  add column if not exists inventory jsonb not null default '[]'::jsonb;

alter table public.characters
  add column if not exists equipped_gun text;

alter table public.characters
  add column if not exists equipped_pet text;
