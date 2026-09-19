-- Purchases are paid by the player signing a token transfer themselves. The
-- server verifies the transaction on-chain and records it here.
--
-- The primary key is the transaction hash, and that is the whole point: a hash
-- is public, so without a uniqueness constraint a player could replay the same
-- payment to buy an unlimited number of items. The insert is what claims a
-- payment; if it conflicts, the payment was already spent.
--
-- Safe to re-run.

create table if not exists public.token_payments (
  tx_hash text primary key,
  wallet_address text not null,
  chain public.wallet_chain not null,
  -- Base units, as an exact integer. Never a float: token amounts have 18
  -- decimals and rounding a ledger is how money goes missing.
  amount numeric(78, 0) not null,
  purpose text not null,
  item_id text,
  created_at timestamptz not null default now()
);

create index if not exists token_payments_wallet_idx
  on public.token_payments (wallet_address, chain);

alter table public.token_payments enable row level security;
revoke all on public.token_payments from anon, authenticated;
