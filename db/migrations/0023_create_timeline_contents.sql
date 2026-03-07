create table timeline_contents (
  id integer primary key autoincrement,
  uid text not null,
  name text not null,
  start_at text not null,
  end_at text,
  endless integer not null default 0,
  image_url text,
  videos text not null default '[]',
  content_type text not null,
  run_type text not null default 'first',
  content_uid text,
  recruitment_group_uid text,
  confirmed integer not null default 0,
  tags text not null default '[]',
  occurrence integer,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create unique index if not exists timeline_contents_uid on timeline_contents (uid);
