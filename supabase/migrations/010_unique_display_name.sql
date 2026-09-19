-- Display names are unique. They are the identity players see on nametags, in
-- the friends list and on the map, and the game moves real value between
-- players - so two people sharing a name makes impersonation a working scam.
--
-- Uniqueness is enforced on a normalized key, not the name itself: "Milton",
-- "milton" and "milt0n" must collide. The app computes the key (shared/names.ts)
-- so client and server agree on what "the same name" means.
--
-- Safe to re-run.

alter table public.characters
  add column if not exists display_name_key text;

-- Backfill anything already present with a best-effort key. The app's rule is
-- richer (it also folds rn -> m and strips zero-width marks); this only has to
-- be good enough for rows that predate the constraint.
update public.characters
set display_name_key = replace(translate(lower(display_name), '01234568l7', 'oizeasgbit'), '_', '')
where display_name_key is null;

alter table public.characters
  alter column display_name_key set not null;

-- Case and lookalikes are already folded into the key, so a plain unique index
-- is enough here.
create unique index if not exists characters_display_name_key_uniq
  on public.characters (display_name_key);
