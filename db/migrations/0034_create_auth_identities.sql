create table if not exists auth_identities (
  id integer primary key autoincrement,
  senseiId integer not null,
  provider text not null,
  providerUserId text not null,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists auth_identities_provider_user on auth_identities (provider, providerUserId);
create index if not exists auth_identities_senseiId on auth_identities (senseiId);

create table if not exists pending_sensei_registrations (
  id integer primary key autoincrement,
  uid text not null,
  provider text not null,
  providerUserId text not null,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists pending_sensei_registrations_uid on pending_sensei_registrations (uid);
create unique index if not exists pending_sensei_registrations_provider_user on pending_sensei_registrations (provider, providerUserId);

insert or ignore into auth_identities (senseiId, provider, providerUserId, createdAt, updatedAt)
select id, 'google', googleId, current_timestamp, current_timestamp
from senseis
where active = 1 and googleId is not null;

insert or ignore into auth_identities (senseiId, provider, providerUserId, createdAt, updatedAt)
select id, 'github', githubId, current_timestamp, current_timestamp
from senseis
where active = 1 and githubId is not null;

update senseis
set googleId = 'zzz_' || googleId
where active = 0
  and googleId is not null
  and googleId not like 'zzz_%';
