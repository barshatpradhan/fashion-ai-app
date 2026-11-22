-- Demo guard cache: last good AI result per key, served when a live call fails during the demo.
-- RLS on with no client policies: reachable only via the service role.
create table public.demo_cache (
  key text primary key,
  value jsonb,
  image_path text
);

alter table public.demo_cache enable row level security;
