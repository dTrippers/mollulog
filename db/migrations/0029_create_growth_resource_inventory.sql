create table growth_resource_inventory (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  itemUid text not null,
  quantity integer not null default 0,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists growth_resource_inventory_uid on growth_resource_inventory (uid);
create unique index if not exists growth_resource_inventory_userId_itemUid on growth_resource_inventory (userId, itemUid);
