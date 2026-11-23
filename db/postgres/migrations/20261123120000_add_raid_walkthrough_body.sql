-- A 공략/타임라인 is now written as a body: a Tiptap document (see app/domain/guide-body.ts) that the server checks
-- against an allowlist before storing it. Null means the guide has no body. The description column stays; the code no
-- longer reads or writes it, and retiring it follows docs/data/database.md.
ALTER TABLE raid_walkthroughs ADD COLUMN body jsonb;
