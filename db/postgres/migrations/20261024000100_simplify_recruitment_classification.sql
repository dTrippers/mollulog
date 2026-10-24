-- Drain old classifier jobs and pause opinion writes before this migration.
-- Deploy the new application before resuming writes; cleanup is a separate operation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM community_post_recruitment_opinions r
    LEFT JOIN community_posts p ON p.uid = r.post_uid
    WHERE p.uid IS NULL OR p.post_type <> 'event_opinion'
      OR (r.recruitment_opinion_classification_status IS NOT NULL
        AND r.recruitment_opinion_classification_status NOT IN ('pending', 'failed', 'completed'))
      OR (r.recruitment_opinion_classification_status = 'completed' AND (
        r.recruitment_opinion_classification IS NULL
        OR r.recruitment_opinion_classification NOT IN ('RESULT_RELATED', 'OTHER')
        OR r.recruitment_period_start_at IS NULL
        OR p.created_at < r.recruitment_period_start_at
      ))
      OR (r.recruitment_opinion_classification IS NOT NULL
        AND r.recruitment_opinion_classification_status IS DISTINCT FROM 'completed')
  ) THEN
    RAISE EXCEPTION 'Recruitment classification migration requires valid, eligible legacy opinions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM community_post_recruitment_opinions
    WHERE recruitment_opinion_classification_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Drain pending recruitment classification jobs before migrating';
  END IF;
END $$;

ALTER TABLE community_posts ADD COLUMN recruitment_classification text;

UPDATE community_posts p
SET recruitment_classification = CASE
  WHEN r.recruitment_opinion_classification_status = 'completed'
    AND r.recruitment_opinion_classification = 'RESULT_RELATED' THEN 'result'
  WHEN r.recruitment_opinion_classification_status = 'completed'
    AND r.recruitment_opinion_classification = 'OTHER' THEN 'other'
  WHEN r.recruitment_opinion_classification_status = 'failed' THEN 'failed'
  ELSE NULL
END
FROM community_post_recruitment_opinions r
WHERE p.uid = r.post_uid;
