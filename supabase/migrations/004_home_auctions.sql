-- Home auctions and ownership. Keyed by wallet so a bid survives a refresh,
-- a reconnect, or a server restart. Safe to re-run.

create table if not exists public.home_auctions (
  -- Home ids come from deterministic world generation, so they are stable
  -- across builds and make a natural primary key.
  home_id text primary key,
  city public.city_id not null default 'trench',

  owner_wallet text,
  owner_chain public.wallet_chain,
  owner_name text,
  sold_at timestamptz,

  -- Owner has relisted the home. Meaningless while owner_wallet is null,
  -- because an unowned home is always on the market.
  for_sale boolean not null default false,
  last_price numeric(12, 2) not null default 0,
  -- Seller's asking price for the current listing. 0 means the city still owns
  -- it and the configured HOME_OPENING_BID floor applies instead.
  asking_price numeric(12, 2) not null default 0,
  -- Seller-chosen auction length. 0 means fall back to HOME_AUCTION_SECONDS.
  duration_seconds integer not null default 0,
  -- Owner-controlled access. Unlocking lets anyone in without giving the home
  -- away; ownership is owner_wallet and nothing else.
  locked boolean not null default true,
  -- Auction closed on a player's home and the seller owes an accept/reject.
  awaiting_seller boolean not null default false,
  decide_by timestamptz,

  high_bid numeric(12, 2) not null default 0,
  high_bidder_wallet text,
  high_bidder_chain public.wallet_chain,
  high_bidder_name text,

  -- Where the home physically sat when it was sold. If the id scheme ever
  -- drifts, this is what lets rows be re-matched to buildings by position
  -- instead of guesswork.
  lot_gx smallint,
  lot_gz smallint,

  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the fact for anyone who already ran an earlier copy of this file.
alter table public.home_auctions
  add column if not exists for_sale boolean not null default false;
alter table public.home_auctions
  add column if not exists last_price numeric(12, 2) not null default 0;
alter table public.home_auctions
  add column if not exists asking_price numeric(12, 2) not null default 0;
alter table public.home_auctions
  add column if not exists duration_seconds integer not null default 0;
alter table public.home_auctions
  add column if not exists locked boolean not null default true;
alter table public.home_auctions
  add column if not exists awaiting_seller boolean not null default false;
alter table public.home_auctions
  add column if not exists decide_by timestamptz;
alter table public.home_auctions
  add column if not exists lot_gx smallint;
alter table public.home_auctions
  add column if not exists lot_gz smallint;

-- Auctions still open are the ones the room loads and ticks on boot.
create index if not exists home_auctions_open_idx
  on public.home_auctions (ends_at)
  where owner_wallet is null;

create index if not exists home_auctions_owner_idx
  on public.home_auctions (owner_wallet, owner_chain);

-- One live escrow per wallet per home: the standing high bid. Lets a refund
-- find its way back to a wallet that is not currently connected.
create index if not exists home_auctions_bidder_idx
  on public.home_auctions (high_bidder_wallet, high_bidder_chain);

-- Security. The frontend ships a Supabase anon key in its bundle, so the REST
-- API is reachable by anyone who opens devtools. Without RLS, `anon` could
-- PATCH this table directly and rewrite high_bid or hand itself owner_wallet.
--
-- No policies are created on purpose: RLS with zero policies denies every
-- anon/authenticated request outright. The backend connects with
-- SUPABASE_SERVICE_ROLE_KEY, which has BYPASSRLS, so the room is unaffected.
-- Bids must only ever be written by the server, which validates the bidder's
-- wallet, credits, and the auction deadline before it touches this table.
alter table public.home_auctions enable row level security;

-- Defence in depth: strip the default grants too, so a permissive policy added
-- here by accident later still does not expose the table.
revoke all on public.home_auctions from anon, authenticated;
