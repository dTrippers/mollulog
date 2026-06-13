alter table recruited_students add column level integer;
alter table recruited_students add column skillEx integer;
alter table recruited_students add column skillNormal integer;
alter table recruited_students add column skillEnhanced integer;
alter table recruited_students add column skillSub integer;
alter table recruited_students add column equip1 integer;
alter table recruited_students add column equip2 integer;
alter table recruited_students add column equip3 integer;
alter table recruited_students add column equipSpecial integer;

update recruited_students
set
  level = (
    select student_growth.level
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  skillEx = (
    select student_growth.skillEx
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  skillNormal = (
    select student_growth.skillNormal
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  skillEnhanced = (
    select student_growth.skillEnhanced
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  skillSub = (
    select student_growth.skillSub
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  equip1 = (
    select student_growth.equip1
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  equip2 = (
    select student_growth.equip2
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  equip3 = (
    select student_growth.equip3
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  equipSpecial = (
    select student_growth.equipSpecial
    from student_growth
    where student_growth.userId = recruited_students.userId
      and student_growth.studentUid = recruited_students.studentUid
  ),
  updatedAt = current_timestamp
where exists (
  select 1
  from student_growth
  where student_growth.userId = recruited_students.userId
    and student_growth.studentUid = recruited_students.studentUid
);
