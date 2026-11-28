-- A raid row's Korean-server (GL) season number. While BAQL has no GL schedule for the row's JP season, this is the
-- operator's prediction, and screens show it as the row's season number. The timeline auto sync copies BAQL's GL
-- season number into it while a GL schedule exists. Null when the number is not known; screens then show none.
ALTER TABLE timeline_contents ADD COLUMN gl_raid_season_index integer;
