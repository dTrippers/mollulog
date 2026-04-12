alter table parties add column raidType text;
alter table parties add column seasonIndex integer;

create index if not exists parties_raid_type_season_index on parties (raidType, seasonIndex);
