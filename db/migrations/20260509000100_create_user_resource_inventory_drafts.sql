create table user_resource_inventory_drafts (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  status text not null default 'pending',
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp,
  appliedAt text
);

create unique index if not exists user_resource_inventory_drafts_uid on user_resource_inventory_drafts (uid);
create index if not exists user_resource_inventory_drafts_userId_status on user_resource_inventory_drafts (userId, status);

create table user_resource_inventory_draft_items (
  id integer primary key autoincrement,
  uid text not null,
  draftUid text not null,
  itemUid text not null,
  quantity integer not null,
  createdAt text not null default current_timestamp
);

create unique index if not exists user_resource_inventory_draft_items_uid on user_resource_inventory_draft_items (uid);
create unique index if not exists user_resource_inventory_draft_items_draftUid_itemUid on user_resource_inventory_draft_items (draftUid, itemUid);
create index if not exists user_resource_inventory_draft_items_draftUid on user_resource_inventory_draft_items (draftUid);
