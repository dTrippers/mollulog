BEGIN;

ALTER TABLE feedback_tickets
  ADD COLUMN operator_notification_sent_at timestamptz;

ALTER TABLE feedback_replies
  ADD COLUMN operator_notification_sent_at timestamptz;

-- Existing rows predate the polling worker and must not be delivered after it
-- deploys. New rows remain NULL until their Discord notification succeeds.
UPDATE feedback_tickets
   SET operator_notification_sent_at = now()
 WHERE operator_notification_sent_at IS NULL;

UPDATE feedback_replies
   SET operator_notification_sent_at = now()
 WHERE operator_notification_sent_at IS NULL;

CREATE INDEX feedback_tickets_operator_notification_pending_idx
  ON feedback_tickets (id)
  WHERE operator_notification_sent_at IS NULL;

CREATE INDEX feedback_replies_operator_notification_pending_idx
  ON feedback_replies (id)
  WHERE operator_notification_sent_at IS NULL
    AND is_admin = false;

COMMIT;
