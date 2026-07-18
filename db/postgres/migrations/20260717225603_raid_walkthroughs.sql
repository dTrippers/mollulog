CREATE TABLE raid_walkthroughs (
  uid text PRIMARY KEY,
  user_id integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL,
  boss_uid text NOT NULL,
  terrain text NOT NULL,
  defense_type text NOT NULL,
  max_difficulty text NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT raid_walkthroughs_visibility CHECK (visibility IN ('public', 'private')),
  CONSTRAINT raid_walkthroughs_terrain CHECK (terrain IN ('indoor', 'outdoor', 'street')),
  CONSTRAINT raid_walkthroughs_defense_type CHECK (defense_type IN ('light', 'heavy', 'special', 'elastic')),
  CONSTRAINT raid_walkthroughs_max_difficulty CHECK (max_difficulty IN ('normal', 'hard', 'very_hard', 'hardcore', 'extreme', 'insane', 'torment', 'lunatic')),
  CONSTRAINT raid_walkthroughs_document_object CHECK (jsonb_typeof(document) = 'object')
);

CREATE INDEX raid_walkthroughs_user_updated_at_idx
  ON raid_walkthroughs (user_id, updated_at DESC);

CREATE INDEX raid_walkthroughs_boss_visibility_updated_at_idx
  ON raid_walkthroughs (boss_uid, visibility, updated_at DESC);
