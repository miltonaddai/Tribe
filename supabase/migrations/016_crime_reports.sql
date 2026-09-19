-- The police station blotter: reports filed by players, readable for 72 hours
-- by anyone standing in a station in the same city. Safe to re-run.
--
-- Persisted rather than held in memory because the 72 hour window is longer
-- than any server process is expected to live. A restart must not empty the
-- board.

create table if not exists public.crime_reports (
  id uuid primary key default gen_random_uuid(),
  -- Which city's force the report was filed with. The board is scoped to this,
  -- so each district's station shows its own district's incidents.
  city text not null,
  offence text not null,
  reporter_wallet text not null,
  reporter_chain public.wallet_chain not null,
  reporter_name text not null default 'citizen',
  -- The accused is stored as the name shown at the time, not as a wallet.
  -- A report is a player's account of what happened, not a verified fact, and
  -- resolving it to a wallet would give it an authority it has not earned.
  -- Empty when the report names nobody, which is allowed.
  accused_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

-- The board reads one city, newest first, within the window - this covers it.
create index if not exists crime_reports_city_idx
  on public.crime_reports (city, created_at desc);

-- Rate limiting counts a wallet's recent reports before accepting another.
create index if not exists crime_reports_reporter_idx
  on public.crime_reports (reporter_wallet, reporter_chain, created_at desc);

-- Same posture as every other table here: the anon key ships inside the
-- frontend bundle, so it gets nothing. Only the server writes, and only after
-- checking the player is actually standing in a station.
alter table public.crime_reports enable row level security;
revoke all on public.crime_reports from anon, authenticated;
