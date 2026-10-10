BEGIN;

-- Deploy canonical-only cleanup code and drain older Workers before running this file.
-- A busy table aborts the entire rename instead of waiting indefinitely.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE recruited_students, student_growth, user_relationship_levels,
  student_state_migration_control IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM student_state_migration_control
    WHERE key = 'default' AND nullable_semantics_enabled = true
  ) THEN
    RAISE EXCEPTION 'Student-state nullable semantics must be activated before archiving legacy tables';
  END IF;
END;
$$;

-- RENAME preserves every row, column, timestamp, constraint, index, sequence and grant.
ALTER TABLE recruited_students RENAME TO zzz_recruited_students;
ALTER TABLE student_growth RENAME TO zzz_student_growth;
ALTER TABLE user_relationship_levels RENAME TO zzz_user_relationship_levels;
ALTER TABLE student_state_migration_control RENAME TO zzz_student_state_migration_control;

COMMIT;
