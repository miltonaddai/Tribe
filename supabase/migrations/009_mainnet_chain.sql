-- Moving from Robinhood Chain testnet to mainnet.
--
-- Renaming the enum label rather than adding a value and migrating rows: RENAME
-- VALUE rewrites the label in place, so all 11 chain columns across 8 tables
-- follow automatically with no data copy and no downtime.
--
-- Safe to re-run.

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'wallet_chain' and e.enumlabel = 'robinhood-testnet'
  ) then
    alter type public.wallet_chain rename value 'robinhood-testnet' to 'robinhood';
  end if;
end $$;

-- 'solana-testnet' is left in place. Nothing writes it, and dropping a value
-- from an enum in Postgres means recreating the type and rewriting every
-- dependent column - all risk, no benefit.
