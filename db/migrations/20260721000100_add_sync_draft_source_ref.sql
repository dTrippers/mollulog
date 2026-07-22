ALTER TABLE sync_drafts ADD COLUMN sourceRef text;

CREATE UNIQUE INDEX IF NOT EXISTS sync_drafts_userId_source_sourceRef
ON sync_drafts (userId, source, sourceRef)
WHERE sourceRef IS NOT NULL;
