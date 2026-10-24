-- Run only after the Haiku application is deployed and every old invocation has drained.
-- The additive migration has already copied classifications, including manual corrections.
-- This removes the rollback source; retain an operator backup before running it.
DROP TABLE community_post_recruitment_opinions;
