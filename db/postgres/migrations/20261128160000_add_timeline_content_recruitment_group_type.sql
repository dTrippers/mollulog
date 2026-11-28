-- The recruitment type of a forecast group (recruitment_group_uid null), with the values BAQL uses for
-- `recruitment_groups.recruitment_type`: usual, limited, fes, archive, encore, recollect, premium_dash. The type decides
-- the period rule, so it is stored even before the group's students are known. Null on a confirmed group, whose type
-- BAQL owns. On a forecast group, end_at null means the recruitment has no end date; a per-player period (as for
-- premium_dash) is not stored as dates and follows from the type.
ALTER TABLE timeline_content_recruitment_groups ADD COLUMN recruitment_type text;
