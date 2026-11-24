-- Human-readable stable id for knowledge-base rows; the CSV `id` column maps here.
alter table public.kb_entries add column if not exists slug text;
update public.kb_entries set slug = id::text where slug is null;
alter table public.kb_entries alter column slug set not null;
create unique index if not exists kb_entries_slug_key on public.kb_entries (slug);
