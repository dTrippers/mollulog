alter table timeline_contents add column synced_at text;

update timeline_contents set synced_at = current_timestamp;
