-- Owners can sell their car the same way they sell a home: name a price, and
-- the first buyer to pay it takes ownership.
--
-- Safe to re-run.

alter table public.player_vehicles
  add column if not exists for_sale boolean not null default false;

alter table public.player_vehicles
  add column if not exists asking_price numeric(12, 0) not null default 0;
