ALTER TABLE ocr_jobs
  ADD COLUMN purge_after timestamptz,
  ADD COLUMN training_consent_at timestamptz,
  ADD COLUMN training_consent_version text;

UPDATE ocr_jobs
SET purge_after = expires_at + interval '3 days'
WHERE purge_after IS NULL;

ALTER TABLE ocr_jobs
  ALTER COLUMN purge_after SET NOT NULL;

CREATE INDEX ocr_jobs_purge_after_idx ON ocr_jobs (purge_after);
