create table if not exists content_comments (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  contentId text not null,
  parentCommentId integer,
  body text not null,
  visibility text not null default 'private',
  pinned integer not null default 0,
  createdAt timestamp not null default current_timestamp,
  updatedAt timestamp not null default current_timestamp,
  foreign key (parentCommentId) references content_comments(id)
);

create unique index if not exists content_comments_uid on content_comments (uid);
create index if not exists content_comments_contentId on content_comments (contentId);
create index if not exists content_comments_parentCommentId on content_comments (parentCommentId);
create index if not exists content_comments_userId_contentId on content_comments (userId, contentId);


insert into content_comments (uid, userId, contentId, parentCommentId, body, visibility, pinned, createdAt, updatedAt)
  select uid, userId, contentId, null, body, visibility, 1, createdAt, updatedAt from content_memos
  where body != '';
