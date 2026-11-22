-- Recruitment-result hiding becomes the default for every account. Existing
-- rows cannot tell an explicit OFF from the old default, so all are enabled.
ALTER TABLE senseis
  ALTER COLUMN hide_recruitment_opinions SET DEFAULT true;

UPDATE senseis
  SET hide_recruitment_opinions = true
  WHERE hide_recruitment_opinions = false;
