create table pyroxene_collected_sources (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  sourceKey text not null,
  collectedAt text not null,
  createdAt text not null default current_timestamp
);

create unique index if not exists pyroxene_collected_sources_uid on pyroxene_collected_sources (uid);
create unique index if not exists pyroxene_collected_sources_userId_sourceKey on pyroxene_collected_sources (userId, sourceKey);
