-- Friend requests and friendships, keyed by wallet so they outlive a session.
-- One row per direction of request; accepting flips its status rather than
-- creating a second row. Safe to re-run.

do $$ begin
  create type public.friend_status as enum ('pending', 'accepted');
exception when duplicate_object then null;
end $$;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_wallet text not null,
  requester_chain public.wallet_chain not null,
  requester_name text not null default 'citizen',
  addressee_wallet text not null,
  addressee_chain public.wallet_chain not null,
  addressee_name text not null default 'citizen',
  status public.friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- Stops a second request stacking up while one is already outstanding.
  unique (requester_wallet, requester_chain, addressee_wallet, addressee_chain)
);

-- Both sides of a friendship are looked up on join, so index each direction.
create index if not exists friendships_requester_idx
  on public.friendships (requester_wallet, requester_chain, status);

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_wallet, addressee_chain, status);

-- Same posture as the other tables: the anon key ships in the frontend bundle,
-- so deny it outright. Only the server writes here, and only after checking
-- that the wallet sending the request is the one it claims to be.
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;
