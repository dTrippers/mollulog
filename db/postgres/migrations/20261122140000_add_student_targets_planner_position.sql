-- The student growth planner's manual order. Positions ascend from the top of the planner. A planner row without a
-- position sits above every positioned row, newest planner registration first, so existing rows start in the default
-- order (플래너 등록 최신순) and a newly added student appears at the top. Reordering assigns every planner row of the
-- user a position; leaving the planner clears it. Rows outside the planner (student_growth_uid null) keep it null.
ALTER TABLE student_targets ADD COLUMN planner_position integer;
