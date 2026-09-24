ALTER TABLE student_summary_revisions
  DROP CONSTRAINT IF EXISTS student_summary_revisions_identity_uidx;

DROP INDEX IF EXISTS student_summary_revisions_identity_uidx;

ALTER TABLE student_summary_revisions
  ADD CONSTRAINT student_summary_revisions_identity_uidx
  UNIQUE NULLS NOT DISTINCT (student_uid, source_hash, provider, model, prompt_version, published_at);
