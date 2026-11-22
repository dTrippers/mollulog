-- Resource inventory drafts were the review step of the old edit.resources save flow. Nothing has created a draft
-- since that flow saved directly (2026-05-09), production held no drafts or draft items on 2026-11-22, and no
-- foreign key or view depends on either table. The review screen that read them is removed with this migration.
--
-- Apply after the code that no longer reads these tables is deployed.
DROP TABLE user_resource_inventory_draft_items;
DROP TABLE user_resource_inventory_drafts;
