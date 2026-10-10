-- Operational SQL. This is not a schema migration.
-- Do not run through db/migrations or pnpm prod:db:migrate.
-- Run after migration 20261009000100_add_labels_to_senseis.sql has been applied.
-- Idempotent: adds the official label only when the account does not already have it.
UPDATE senseis
SET labels = labels || '["official"]'::jsonb,
    updated_at = now()
WHERE username = 'mollulog'
  AND NOT (labels @> '["official"]'::jsonb);
