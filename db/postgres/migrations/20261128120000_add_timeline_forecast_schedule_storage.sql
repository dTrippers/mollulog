-- Forecast (미확정) Korean-server schedules are kept in MolluLog itself, because BAQL will keep only schedules that are
-- in the game client or officially announced.

-- A raid row's raid type, and the index of the JP season it corresponds to. A raid type is the same in every region;
-- BAQL links a GL schedule to its JP season by the same raid type and that index (`raidSchedule.jpSchedule.raidType`
-- and `.seasonIndex`). A GL season number is a prediction until the season is confirmed, so the sync finds a raid row
-- by this pair, never by its GL schedule uid. Null on rows that are not raids or whose JP season is not known yet.
ALTER TABLE timeline_contents ADD COLUMN raid_type text;
ALTER TABLE timeline_contents ADD COLUMN jp_raid_season_index integer;

