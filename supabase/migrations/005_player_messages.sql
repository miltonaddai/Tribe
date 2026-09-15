-- Message centre. Auction events are addressed to a wallet, not a session, so
-- they survive a refresh and reach a player who was offline when they fired.
-- Safe to re-run.

create table if not exists public.player_messages (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  chain public.wallet_chain not null,
  -- 'bid', 'outbid', 'sold', 'bought', 'offer', 'listed', 'expired'
  kind text not null,
  body text not null,
  home_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists player_messages_inbox_idx
  on public.player_messages (wallet, chain, created_at desc);

create index if not exists player_messages_unread_idx
  on public.player_messages (wallet, chain)
  where read = false;

-- Same posture as home_auctions: the anon key ships in the frontend bundle, so
-- deny it outright. Only the server (service role, BYPASSRLS) writes here, and
-- it only ever addresses a message to a wallet it has just acted on.
alter table public.player_messages enable row level security;
revoke all on public.player_messages from anon, authenticated;
