create table pyroxene_event_data (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  eventUid text not null,
  completed integer not null default 0, -- boolean (0 or 1)
  expectedTrials integer,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists pyroxene_event_data_uid on pyroxene_event_data (uid);
create unique index if not exists pyroxene_event_data_userId_eventUid on pyroxene_event_data (userId, eventUid);


alter table pyroxene_owned_resources drop column eventUid;
