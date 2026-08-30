create table timeline_contents (
  uid text primary key,
  start_at timestamptz not null,
  end_at timestamptz,
  endless boolean not null default false,
  image_url text,
  videos jsonb not null default '[]'::jsonb,
  content_type text not null,
  run_type text not null default 'first',
  content_uid text,
  recruitment_group_uid text,
  confirmed boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  occurrence integer,
  synced_at timestamptz,
  is_spoiler boolean not null default false,
  earnable_pyroxene integer,
  shop_content_uid text,
  name_i18n jsonb not null default '{}'::jsonb,
  recruitment_student_uids text[],
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index timeline_contents_start_at_uid_idx on timeline_contents (start_at, uid);
create index timeline_contents_end_at_idx on timeline_contents (end_at);
create index timeline_contents_recruitment_group_uid_idx
  on timeline_contents (recruitment_group_uid)
  where recruitment_group_uid is not null;
