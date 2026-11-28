-- Foreign key constraints are not used. timeline_content_recruitment_group_id stays as a plain reference to
-- timeline_content_recruitment_groups.id; the code that deletes a recruitment group deletes its forecast students.
ALTER TABLE timeline_content_forecast_students
  DROP CONSTRAINT timeline_content_forecast_stu_timeline_content_recruitment_fkey;
