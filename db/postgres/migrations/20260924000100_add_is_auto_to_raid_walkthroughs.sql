ALTER TABLE raid_walkthroughs
  ADD COLUMN is_auto boolean NOT NULL DEFAULT false;

CREATE INDEX raid_walkthroughs_auto_visibility_updated_at_idx
  ON raid_walkthroughs (is_auto, visibility, updated_at DESC);
