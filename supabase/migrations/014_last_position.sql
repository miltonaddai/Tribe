-- Remember where a wallet was standing, so signing back in puts you where you
-- left off rather than at the district spawn.
--
-- Nullable on purpose: null means "never saved", which is how a new wallet gets
-- the spawn point instead of the origin.
--
-- Safe to re-run.

alter table public.wallets
  add column if not exists last_x numeric(10, 2);

alter table public.wallets
  add column if not exists last_z numeric(10, 2);
