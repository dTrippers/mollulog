insert into content_favorite_counts (
  studentId,
  contentId,
  count,
  createdAt,
  updatedAt
)
select
  studentId,
  contentId,
  count(*),
  current_timestamp,
  current_timestamp
from content_favorite_students
-- SQLite requires a WHERE clause here to disambiguate SELECT UPSERT syntax.
where 1 = 1
group by studentId, contentId
on conflict (studentId, contentId) do update set
  count = excluded.count,
  updatedAt = current_timestamp;

delete from content_favorite_counts
where not exists (
  select 1
  from content_favorite_students
  where content_favorite_students.studentId = content_favorite_counts.studentId
    and content_favorite_students.contentId = content_favorite_counts.contentId
);
