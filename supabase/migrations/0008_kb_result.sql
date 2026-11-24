-- What a redesign Recipe's finished piece looks like (one or two sentences). Used only to brief the
-- Concept-image model, never shown as a claim; changing it alone keeps a reviewed row reviewed (see kb import).
alter table public.kb_entries add column if not exists result text;
alter table public.kb_entries drop constraint if exists kb_entries_result_check;
alter table public.kb_entries add constraint kb_entries_result_check check (result is null or char_length(result) <= 400);
notify pgrst, 'reload schema';
