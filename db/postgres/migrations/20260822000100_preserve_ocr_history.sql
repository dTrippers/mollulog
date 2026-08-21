ALTER TABLE ocr_jobs
  ADD COLUMN storage_purged_at timestamptz;

CREATE INDEX ocr_jobs_pending_storage_purge_idx
  ON ocr_jobs (purge_after)
  WHERE storage_purged_at IS NULL;
