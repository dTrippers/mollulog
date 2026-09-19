ALTER TABLE senseis
  ADD COLUMN hide_recruitment_opinions boolean NOT NULL DEFAULT false;

ALTER TABLE community_posts
  ADD COLUMN recruitment_period_start_at timestamptz,
  ADD COLUMN recruitment_opinion_classification_status text,
  ADD COLUMN recruitment_opinion_classification text,
  ADD COLUMN recruitment_opinion_classification_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN recruitment_opinion_classification_model text,
  ADD COLUMN recruitment_opinion_classification_prompt_version text,
  ADD COLUMN recruitment_opinion_classified_at timestamptz;

CREATE INDEX community_posts_recruitment_opinion_classification_idx
  ON community_posts (subject_content_uid, recruitment_opinion_classification_status)
  WHERE post_type = 'event_opinion';
