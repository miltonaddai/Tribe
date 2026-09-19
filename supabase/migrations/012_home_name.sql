-- Owners can name their home. Decoration only: no uniqueness, no index, and an
-- empty string means unnamed.
--
-- Safe to re-run.

alter table public.home_auctions
  add column if not exists name text not null default '';
