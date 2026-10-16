-- Accept common mobile-camera image formats across every image-oriented bucket.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif','image/gif'
]
WHERE id IN ('photos-profils','photos-equipes','account-request-photos');

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif','application/pdf'
]
WHERE id = 'pieces-identite';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif',
  'video/mp4','video/webm','video/quicktime'
]
WHERE id = 'rapports-techniques';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/msword','application/pdf','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/gif','image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif',
  'text/csv','text/plain','video/3gpp','video/mp4','video/quicktime','video/webm'
]
WHERE id = 'notification-media';
