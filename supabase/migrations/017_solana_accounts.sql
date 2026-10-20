-- Username accounts, and Solana in place of Robinhood Chain.
--
-- Players used to be identified by their EVM wallet. Now anyone can play with a
-- username and password, and every table that was keyed by wallet_address
-- holds the account's player id instead ('acct:<uuid>'). A Solana wallet is
-- linked to an account later, only to pay for things and to count $TRIBE held.
--
-- Robinhood rows are left where they are. Nothing reads them any more - this is
-- a fresh start - and dropping enum values in Postgres means rewriting every
-- dependent column for no benefit.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that adds it,
-- so if the SQL editor wraps this file in one, run the first statement on its
-- own first.
--
-- Safe to re-run.

alter type public.wallet_chain add value if not exists 'solana';

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  -- As typed, for display. Uniqueness is on the normalized key, the same rule
  -- display names use (shared/names.ts), so "Milton" and "milt0n" collide.
  username text not null,
  username_key text not null,
  -- scrypt$<salt hex>$<hash hex>. Never the password.
  password_hash text not null,
  -- The linked Solana wallet. One wallet, one account: otherwise a single
  -- wallet's holdings could unlock districts for any number of accounts.
  solana_address text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create unique index if not exists accounts_username_key_uniq on public.accounts (username_key);
create unique index if not exists accounts_solana_address_uniq
  on public.accounts (solana_address)
  where solana_address is not null;

alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;

-- Solana transaction signatures are base58 and case-sensitive. claimPayment
-- used to lower-case EVM hashes; it no longer does, and the primary key on
-- token_payments.tx_hash is what stops a payment being spent twice.
