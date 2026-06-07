create table if not exists recruitment_results (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  recruitmentGroupUid text not null,
  contentUid text,
  completedAt text,
  recruitedStudents text not null default '[]',
  trial integer,
  rawResult text,
  commentPostUid text,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists recruitment_results_uid on recruitment_results (uid);
create unique index if not exists recruitment_results_userId_recruitmentGroupUid
  on recruitment_results (userId, recruitmentGroupUid);
create index if not exists recruitment_results_userId on recruitment_results (userId);
create index if not exists recruitment_results_contentUid on recruitment_results (contentUid);
create index if not exists recruitment_results_commentPostUid on recruitment_results (commentPostUid);

insert into recruitment_results (
  uid,
  userId,
  recruitmentGroupUid,
  completedAt,
  recruitedStudents,
  trial,
  rawResult,
  createdAt,
  updatedAt
)
select
  lower(hex(randomblob(4))),
  ph.userId,
  ph.eventId,
  max(ph.createdAt),
  coalesce((
    select json_group_array(
      json_object(
        'studentUid', tier3_student.value,
        'tier', 3,
        'pickup', 0
      )
    )
    from pickup_histories source_history,
      json_each(source_history.result) trial_result,
      json_each(json_extract(trial_result.value, '$.tier3StudentIds')) tier3_student
    where source_history.userId = ph.userId
      and source_history.eventId = ph.eventId
      and tier3_student.value is not null
  ), '[]'),
  (
    select max(cast(json_extract(trial_result.value, '$.trial') as integer))
    from pickup_histories source_history,
      json_each(source_history.result) trial_result
    where source_history.userId = ph.userId
      and source_history.eventId = ph.eventId
  ),
  (
    select source_history.rawResult
    from pickup_histories source_history
    where source_history.userId = ph.userId
      and source_history.eventId = ph.eventId
      and source_history.rawResult is not null
    order by unixepoch(source_history.createdAt) desc, source_history.id desc
    limit 1
  ),
  min(ph.createdAt),
  max(ph.updatedAt)
from pickup_histories ph
where not exists (
  select 1
  from recruitment_results existing
  where existing.userId = ph.userId
    and existing.recruitmentGroupUid = ph.eventId
)
group by ph.userId, ph.eventId;
