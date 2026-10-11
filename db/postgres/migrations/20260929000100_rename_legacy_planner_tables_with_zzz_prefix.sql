-- Apply only after every running deployment reads and writes planner_states alone.
ALTER TABLE pyroxene_owned_resources RENAME TO zzz_pyroxene_owned_resources;
ALTER TABLE pyroxene_collected_sources RENAME TO zzz_pyroxene_collected_sources;
ALTER TABLE pyroxene_timeline_items RENAME TO zzz_pyroxene_timeline_items;
ALTER TABLE pyroxene_planner_options RENAME TO zzz_pyroxene_planner_options;
ALTER TABLE pyroxene_event_data RENAME TO zzz_pyroxene_event_data;
ALTER TABLE event_shop_states RENAME TO zzz_event_shop_states;
