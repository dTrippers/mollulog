ALTER TABLE discord_notification_subscriptions
  ADD COLUMN IF NOT EXISTS lead_hours integer NOT NULL,
  ADD COLUMN IF NOT EXISTS event_start_effective_at timestamptz NOT NULL,
  ADD COLUMN IF NOT EXISTS event_end_effective_at timestamptz NOT NULL,
  ADD COLUMN IF NOT EXISTS reward_exchange_end_effective_at timestamptz NOT NULL,
  ADD COLUMN IF NOT EXISTS recruitment_start_effective_at timestamptz NOT NULL;

ALTER TABLE discord_notification_subscriptions
  DROP COLUMN IF EXISTS timing_mode,
  DROP COLUMN IF EXISTS kst_hour,
  DROP COLUMN IF EXISTS effective_at;

DROP INDEX IF EXISTS discord_notification_jobs_dedup_uidx;
CREATE UNIQUE INDEX discord_notification_jobs_dedup_uidx
  ON discord_notification_jobs (user_id, trigger, source_uid, generation);
