-- Closet (Task 13).
-- 1. Deleting a scan's images (spec section 11) keeps its text and corrections with the image paths
--    set to null, so image_path can no longer be NOT NULL.
alter table public.scans alter column image_path drop not null;

-- 2. The garment's original photo (quick add / accessory / saved scan), so delete can remove it from Storage.
alter table public.garments add column if not exists image_path text;

-- 3. A scan is saved to the closet at most once (backs up the API's already_saved check under races).
create unique index if not exists garments_scan_unique on public.garments (scan_id) where scan_id is not null;
