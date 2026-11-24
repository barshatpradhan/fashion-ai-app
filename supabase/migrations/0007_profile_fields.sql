-- Display name for app accounts. Written only by the service role through PATCH /api/profile
-- (profiles has a select-own policy and no update policy, so users cannot set it, is_premium or
-- is_demo directly). The API trims and collapses whitespace; the check keeps the column honest.
alter table public.profiles add column if not exists display_name text;

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check check (
  display_name is null
  or (char_length(display_name) between 1 and 60 and display_name = btrim(display_name))
);

-- PostgREST caches the schema; reload so the new column is visible to the API at once.
notify pgrst, 'reload schema';
