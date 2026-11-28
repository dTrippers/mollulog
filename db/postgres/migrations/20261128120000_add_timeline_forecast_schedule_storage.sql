-- Forecast (미확정) Korean-server schedules are kept in MolluLog itself, because BAQL will keep only schedules that are
-- in the game client or officially announced.

-- The JP raid season a raid row corresponds to, by its client values (BAQL `raidSchedule.jpSchedule.raidType` and
-- `.seasonIndex`). A GL season number is a prediction until the season is confirmed, so the sync finds a raid row by
-- this pair, never by its GL schedule uid. Null on rows that are not raids or whose JP season is not known yet.
ALTER TABLE timeline_contents ADD COLUMN jp_raid_type text;
ALTER TABLE timeline_contents ADD COLUMN jp_raid_season_index integer;

