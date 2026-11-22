-- A 대결전 record can hold its total score alone: the game keeps only the total and the rank of a past season (the
-- trophy cabinet), so a Sensei who did not note each defense type's score knows nothing more.
--
-- score_mode is the score the screens show: 'defense_type' shows the scores per defense type (their sum is the total),
-- and 'total' shows total_score. Both values are kept whichever one is shown, so switching back restores the other;
-- the season chart's per-defense-type autosave also writes scores while a record shows its total. A total_assault
-- record is always 'defense_type'. Existing records hold scores per defense type.
ALTER TABLE raid_records ADD COLUMN score_mode text NOT NULL DEFAULT 'defense_type';
ALTER TABLE raid_records ADD COLUMN total_score integer;
