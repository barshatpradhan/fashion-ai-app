-- Server-side cap for the garments bucket. The browser downscales every photo to 1024 px JPEG
-- (and a PNG cut-out) before uploading, so real uploads are well under 5 MB; this stops a client
-- that skips that step from storing huge or non-image files.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'garments';
