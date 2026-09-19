-- The wallets.symbol check still only allowed SOL and ETH, so every write has
-- been silently rejected since access moved to $TRIBE. Nothing was being
-- recorded per wallet at all - including the last position.
--
-- Safe to re-run.

alter table public.wallets
  drop constraint if exists wallets_symbol_check;

alter table public.wallets
  add constraint wallets_symbol_check check (symbol in ('SOL', 'ETH', 'TRIBE'));

update public.wallets set symbol = 'TRIBE' where symbol <> 'TRIBE';
