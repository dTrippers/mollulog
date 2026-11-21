-- Writers that predate drafts insert posts without published_at. Publishing them on insert keeps those
-- posts public, as before, so the admin app can be deployed after MolluLog. The admin app sets
-- published_at explicitly, null for a draft.
alter table posts alter column published_at set default now();
