-- Operational SQL. This is not a schema migration.
-- Do not run through db/migrations or pnpm prod:db:migrate.
-- Run manually after recruitment_results schema migrations and before deploying canonical recruitment-result reads.
-- Idempotent: updates matching canonical rows, and inserts only missing completed pyroxene rows.

update recruitment_results
set
  completedAt = coalesce(
    completedAt,
    (
      select coalesce(ped.updatedAt, ped.createdAt, current_timestamp)
      from pyroxene_event_data ped
      join timeline_contents tc on tc.uid = ped.eventUid
      where ped.userId = recruitment_results.userId
        and ped.completed = 1
        and tc.recruitment_group_uid = recruitment_results.recruitmentGroupUid
      limit 1
    )
  ),
  contentUid = coalesce(
    contentUid,
    (
      select tc.uid
      from pyroxene_event_data ped
      join timeline_contents tc on tc.uid = ped.eventUid
      where ped.userId = recruitment_results.userId
        and ped.completed = 1
        and tc.recruitment_group_uid = recruitment_results.recruitmentGroupUid
      limit 1
    )
  ),
  updatedAt = current_timestamp
where exists (
  select 1
  from pyroxene_event_data ped
  join timeline_contents tc on tc.uid = ped.eventUid
  where ped.userId = recruitment_results.userId
    and ped.completed = 1
    and tc.recruitment_group_uid = recruitment_results.recruitmentGroupUid
)
and (completedAt is null or contentUid is null);

insert into recruitment_results (
  uid,
  userId,
  recruitmentGroupUid,
  contentUid,
  completedAt,
  recruitedStudents,
  trial,
  rawResult,
  commentPostUid,
  createdAt,
  updatedAt
)
select
  lower(hex(randomblob(4))),
  ped.userId,
  tc.recruitment_group_uid,
  tc.uid,
  coalesce(ped.updatedAt, ped.createdAt, current_timestamp),
  '[]',
  null,
  null,
  null,
  coalesce(ped.createdAt, current_timestamp),
  coalesce(ped.updatedAt, ped.createdAt, current_timestamp)
from pyroxene_event_data ped
join timeline_contents tc on tc.uid = ped.eventUid
where ped.completed = 1
  and tc.recruitment_group_uid is not null
  and not exists (
    select 1
    from recruitment_results existing
    where existing.userId = ped.userId
      and existing.recruitmentGroupUid = tc.recruitment_group_uid
  );
