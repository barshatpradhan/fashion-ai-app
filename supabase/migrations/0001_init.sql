-- REVIVO demo schema, RLS and storage (spec section 8).
-- Service role bypasses RLS; it is used only for scripts, KB writes and credit spend.

create extension if not exists vector;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  is_premium boolean not null default false,
  is_demo boolean not null default false,
  style_profile jsonb,
  free_uploads_used int not null default 0 check (free_uploads_used between 0 and 10),
  upload_credits int not null default 0,
  uploads_refill_at timestamptz,
  free_looks_used int not null default 0 check (free_looks_used between 0 and 10),
  look_credits int not null default 0,
  looks_refill_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- scans
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null,
  cutout_path text,
  image_hash text,
  vision_json jsonb,
  model_name text,
  model_version text,
  fabric_final text,
  fabric_source text check (fabric_source in ('vision', 'label', 'user')),
  created_at timestamptz not null default now()
);
create index scans_user_created_idx on public.scans (user_id, created_at desc);
create index scans_image_hash_idx on public.scans (image_hash);

-- ------------------------------------------------------------- corrections
create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  field text not null check (field in ('fabric', 'garment_type', 'named_style')),
  ai_value text,
  user_value text,
  created_at timestamptz not null default now()
);
create index corrections_scan_idx on public.corrections (scan_id);

-- -------------------------------------------------------------- kb_entries
create table public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  tags text[] not null default '{}',
  difficulty text,
  tools text,
  steps jsonb,
  sources jsonb,
  status text not null default 'draft' check (status in ('draft', 'reviewed')),
  reviewed_by text,
  embedding vector(768)
);
create index kb_entries_tags_idx on public.kb_entries using gin (tags);

-- ------------------------------------------------------------ scan_matches
create table public.scan_matches (
  scan_id uuid not null references public.scans (id) on delete cascade,
  kb_entry_id uuid not null references public.kb_entries (id) on delete cascade,
  score real,
  method text not null check (method in ('tag', 'vector')),
  primary key (scan_id, kb_entry_id)
);

-- ------------------------------------------------------------------ guides
create table public.guides (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  kb_entry_id uuid references public.kb_entries (id) on delete set null,
  body jsonb not null,
  after_image_path text,
  image_provider text,
  outdated boolean not null default false
);
create index guides_scan_idx on public.guides (scan_id);

-- ---------------------------------------------------------------- garments
create table public.garments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid references public.scans (id) on delete set null,
  category text not null check (category in ('clothing', 'accessory')),
  name text,
  cutout_path text,
  image_kind text not null default 'photo' check (image_kind in ('photo', 'concept')),
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'transformed')),
  source_garment_id uuid references public.garments (id) on delete set null,
  recipe_id uuid references public.kb_entries (id) on delete set null,
  created_at timestamptz not null default now()
);
create index garments_user_idx on public.garments (user_id, created_at desc);

-- ---------------------------------------------------------------- activity
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('upload', 'reconstruct', 'style')),
  garment_id uuid references public.garments (id) on delete set null,
  outfit_ref text,
  created_at timestamptz not null default now()
);
create index activity_user_idx on public.activity (user_id, created_at desc);

-- ----------------------------------------------------------------- outfits
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  items uuid[] not null check (cardinality(items) between 2 and 4),
  reason text,
  occasion text,
  created_at timestamptz not null default now()
);
create index outfits_user_idx on public.outfits (user_id, created_at desc);

-- ------------------------------------------- profile row for every new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.activity enable row level security;
alter table public.scans enable row level security;
alter table public.corrections enable row level security;
alter table public.kb_entries enable row level security;
alter table public.scan_matches enable row level security;
alter table public.guides enable row level security;
alter table public.garments enable row level security;
alter table public.outfits enable row level security;

-- profiles: read own row only. Credits/premium are changed by the service role.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

-- Server-authored tables are SELECT-only for the owner. All writes go through the
-- service-role client (daily cap, Upload/Look credits and the Activity Record
-- must not be forgeable or resettable from the browser).
create policy activity_select_own on public.activity
  for select to authenticated using (user_id = auth.uid());

create policy scans_select_own on public.scans
  for select to authenticated using (user_id = auth.uid());

create policy garments_select_own on public.garments
  for select to authenticated using (user_id = auth.uid());

-- outfits: saving is free, so the owner may insert and delete.
create policy outfits_select_own on public.outfits
  for select to authenticated using (user_id = auth.uid());
create policy outfits_insert_own on public.outfits
  for insert to authenticated with check (user_id = auth.uid());
create policy outfits_delete_own on public.outfits
  for delete to authenticated using (user_id = auth.uid());

-- corrections / scan_matches / guides: select via the owning scan, no client writes
create policy corrections_select_own on public.corrections
  for select to authenticated
  using (exists (select 1 from public.scans s where s.id = corrections.scan_id and s.user_id = auth.uid()));

create policy scan_matches_select_own on public.scan_matches
  for select to authenticated
  using (exists (select 1 from public.scans s where s.id = scan_matches.scan_id and s.user_id = auth.uid()));

create policy guides_select_own on public.guides
  for select to authenticated
  using (exists (select 1 from public.scans s where s.id = guides.scan_id and s.user_id = auth.uid()));

-- kb_entries: reviewed rows readable by everyone; no write policies.
create policy kb_entries_read_reviewed on public.kb_entries
  for select to anon, authenticated using (status = 'reviewed');

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('garments', 'garments', false)
on conflict (id) do update set public = false;

create policy garments_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy garments_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy garments_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy garments_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text);
