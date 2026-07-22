create table cache_refresh_jobs (
  uid text primary key not null,
  requestedBy integer not null,
  status text not null,
  activeSlot integer,
  currentTask text,
  completedCount integer not null default 0,
  totalCount integer not null,
  taskResults text not null,
  startedAt text,
  finishedAt text,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index cache_refresh_jobs_active_slot
  on cache_refresh_jobs (activeSlot);

create index cache_refresh_jobs_created_at
  on cache_refresh_jobs (createdAt desc);
