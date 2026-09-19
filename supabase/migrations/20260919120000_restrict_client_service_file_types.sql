-- Client project activity files are intentionally limited to common review
-- formats. Keep the bucket private and retain the existing 100 MB limit.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]::text[]
where id = 'client-service-files';
