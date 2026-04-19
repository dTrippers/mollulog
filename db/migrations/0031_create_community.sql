create table if not exists community_posts (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  postType text not null,
  title text,
  visibility text not null default 'public',
  pinned integer not null default 0,
  subjectStudentUid text,
  subjectContentUid text,
  subjectRaidType text,
  subjectSeasonIndex integer,
  blocks text not null,
  sourceType text,
  sourceUid text,
  sourceId integer,
  migratedAt text,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists community_posts_uid on community_posts (uid);
create unique index if not exists community_posts_source on community_posts (sourceType, sourceUid);
create index if not exists community_posts_postType on community_posts (postType);
create index if not exists community_posts_userId on community_posts (userId);
create index if not exists community_posts_subjectStudentUid on community_posts (subjectStudentUid);
create index if not exists community_posts_subjectContentUid on community_posts (subjectContentUid);
create index if not exists community_posts_subjectRaid on community_posts (subjectRaidType, subjectSeasonIndex);
create index if not exists community_posts_updatedAt on community_posts (updatedAt desc, createdAt desc);
create unique index if not exists community_posts_student_review_per_user
  on community_posts (userId, subjectStudentUid)
  where postType = 'student_review';

create table if not exists community_comments (
  id integer primary key autoincrement,
  uid text not null,
  postUid text not null,
  userId integer not null,
  parentUid text not null,
  body text not null,
  visibility text not null default 'public',
  sourceType text,
  sourceUid text,
  sourceId integer,
  migratedAt text,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists community_comments_uid on community_comments (uid);
create unique index if not exists community_comments_source on community_comments (sourceType, sourceUid);
create index if not exists community_comments_postUid on community_comments (postUid);
create index if not exists community_comments_parentUid on community_comments (parentUid);

create table if not exists community_post_likes (
  id integer primary key autoincrement,
  uid text not null,
  postUid text not null,
  userId integer not null,
  createdAt text not null default current_timestamp
);

create unique index if not exists community_post_likes_uid on community_post_likes (uid);
create unique index if not exists community_post_likes_postUid_userId on community_post_likes (postUid, userId);
create index if not exists community_post_likes_postUid on community_post_likes (postUid);

create table if not exists community_post_tags (
  id integer primary key autoincrement,
  uid text not null,
  postUid text not null,
  studentUid text not null,
  tagValue text not null,
  createdAt text not null default current_timestamp
);

create unique index if not exists community_post_tags_uid on community_post_tags (uid);
create index if not exists community_post_tags_postUid on community_post_tags (postUid);
create index if not exists community_post_tags_studentUid on community_post_tags (studentUid);
create index if not exists community_post_tags_tagValue on community_post_tags (tagValue);

insert or ignore into community_posts (
  uid,
  userId,
  postType,
  visibility,
  pinned,
  subjectStudentUid,
  blocks,
  sourceType,
  sourceUid,
  sourceId,
  migratedAt,
  createdAt,
  updatedAt
)
select
  sg.uid,
  sg.userId,
  'student_review',
  'public',
  0,
  sg.studentUid,
  case
    when sg.comment is null or trim(sg.comment) = '' then json('[]')
    else json_array(json_object('type', 'plaintext', 'text', sg.comment))
  end,
  'student_grading',
  sg.uid,
  sg.id,
  current_timestamp,
  sg.createdAt,
  sg.updatedAt
from student_gradings sg;

insert or ignore into community_post_tags (
  uid,
  postUid,
  studentUid,
  tagValue,
  createdAt
)
select
  sgt.uid,
  post.uid,
  sgt.studentUid,
  sgt.tagValue,
  sgt.createdAt
from student_grading_tags sgt
inner join community_posts post on post.sourceType = 'student_grading' and post.sourceUid = sgt.gradingUid;

insert or ignore into community_posts (
  uid,
  userId,
  postType,
  visibility,
  pinned,
  subjectContentUid,
  blocks,
  sourceType,
  sourceUid,
  sourceId,
  migratedAt,
  createdAt,
  updatedAt
)
select
  cc.uid,
  cc.userId,
  'event_opinion',
  case when cc.visibility = 'private' then 'private' else 'public' end,
  cc.pinned,
  cc.contentId,
  json_array(json_object('type', 'plaintext', 'text', cc.body)),
  'content_comment',
  cc.uid,
  cc.id,
  current_timestamp,
  cc.createdAt,
  cc.updatedAt
from content_comments cc
where cc.parentCommentId is null;

insert or ignore into community_comments (
  uid,
  postUid,
  userId,
  parentUid,
  body,
  visibility,
  sourceType,
  sourceUid,
  sourceId,
  migratedAt,
  createdAt,
  updatedAt
)
select
  child.uid,
  parent.uid,
  child.userId,
  parent.uid,
  child.body,
  case when child.visibility = 'private' then 'private' else 'public' end,
  'content_comment',
  child.uid,
  child.id,
  current_timestamp,
  child.createdAt,
  child.updatedAt
from content_comments child
inner join content_comments legacy_parent on legacy_parent.id = child.parentCommentId
inner join community_posts parent on parent.sourceType = 'content_comment' and parent.sourceUid = legacy_parent.uid
where child.parentCommentId is not null;

insert or ignore into community_posts (
  uid,
  userId,
  postType,
  title,
  visibility,
  subjectRaidType,
  subjectSeasonIndex,
  blocks,
  sourceType,
  sourceUid,
  sourceId,
  migratedAt,
  createdAt,
  updatedAt
)
select
  p.uid,
  p.userId,
  'guide',
  p.name,
  case when p.showAsRaidTip = 1 then 'public' else 'unlisted' end,
  p.raidType,
  p.seasonIndex,
  case
    when p.memo is null or trim(p.memo) = '' then json_array(
      json_object(
        'type', 'party_info',
        'title', p.name,
        'memo', coalesce(p.memo, ''),
        'raidType', p.raidType,
        'seasonIndex', p.seasonIndex,
        'units', json(p.students)
      )
    )
    else json_array(
      json_object('type', 'plaintext', 'text', p.memo),
      json_object(
        'type', 'party_info',
        'title', p.name,
        'memo', p.memo,
        'raidType', p.raidType,
        'seasonIndex', p.seasonIndex,
        'units', json(p.students)
      )
    )
  end,
  'party',
  p.uid,
  p.id,
  current_timestamp,
  p.createdAt,
  p.updatedAt
from parties p;
