create table pyroxene_guest_import_items (
  id integer primary key autoincrement,
  userId integer not null,
  datasetId text not null,
  itemType text not null,
  itemKey text not null,
  importedAt text not null default current_timestamp
);

create unique index pyroxene_guest_import_items_user_dataset_item
  on pyroxene_guest_import_items (userId, datasetId, itemType, itemKey);
