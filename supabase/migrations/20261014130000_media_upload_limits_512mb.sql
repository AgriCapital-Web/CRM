-- Allow large source videos to be optimized in-browser before final storage.
-- The UI still enforces a 10-minute recording cap and a 30-minute upload cap.
update storage.buckets
set file_size_limit = 536870912
where id in ('notification-media', 'rapports-techniques');