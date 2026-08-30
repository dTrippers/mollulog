ALTER TABLE discord_notification_subscriptions
  ADD COLUMN IF NOT EXISTS lead_hours integer NOT NULL;

ALTER TABLE discord_notification_subscriptions
  DROP COLUMN IF EXISTS timing_mode,
  DROP COLUMN IF EXISTS kst_hour;

DROP INDEX IF EXISTS discord_notification_jobs_dedup_uidx;
CREATE UNIQUE INDEX discord_notification_jobs_dedup_uidx
  ON discord_notification_jobs (user_id, trigger, source_uid, generation);
