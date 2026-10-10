ALTER TABLE senseis
  ADD COLUMN labels jsonb NOT NULL DEFAULT '[]'::jsonb;
