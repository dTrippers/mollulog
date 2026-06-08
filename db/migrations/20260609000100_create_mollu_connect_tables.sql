create table sync_drafts (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  apiKeyUid text,
  source text not null default 'connect',
  type text not null,
  status text not null default 'pending',
  toolName text,
  toolVersion text,
  catalogVersion text,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp,
  appliedAt text,
  expiresAt text
);

create unique index if not exists sync_drafts_uid on sync_drafts (uid);
create index if not exists sync_drafts_userId_status on sync_drafts (userId, status);

create table sync_draft_entries (
  id integer primary key autoincrement,
  uid text not null,
  draftUid text not null,
  entryKey text not null,
  value integer not null,
  meta text,
  createdAt text not null default current_timestamp
);

create unique index if not exists sync_draft_entries_uid on sync_draft_entries (uid);
create unique index if not exists sync_draft_entries_draftUid_entryKey on sync_draft_entries (draftUid, entryKey);
create index if not exists sync_draft_entries_draftUid on sync_draft_entries (draftUid);

create table connect_api_keys (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  name text not null,
  keyPrefix text not null,
  keyHash text not null,
  scopes text not null default '["catalog:read","draft:write"]',
  createdAt text not null default current_timestamp,
  expiresAt text,
  lastUsedAt text,
  revokedAt text
);

create unique index if not exists connect_api_keys_uid on connect_api_keys (uid);
create index if not exists connect_api_keys_keyPrefix on connect_api_keys (keyPrefix);
create index if not exists connect_api_keys_userId on connect_api_keys (userId);

create table connect_request_logs (
  id integer primary key autoincrement,
  uid text not null,
  apiKeyUid text,
  endpoint text not null,
  status integer not null,
  createdAt text not null default current_timestamp
);

create unique index if not exists connect_request_logs_uid on connect_request_logs (uid);
create index if not exists connect_request_logs_apiKeyUid_createdAt on connect_request_logs (apiKeyUid, createdAt);
