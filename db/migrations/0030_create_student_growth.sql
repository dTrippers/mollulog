create table student_growth (
  id integer primary key autoincrement,
  uid text not null,
  userId integer not null,
  studentUid text not null,
  level integer,
  skillEx integer,
  skillNormal integer,
  skillEnhanced integer,
  skillSub integer,
  equip1 integer,
  equip2 integer,
  equip3 integer,
  equipSpecial integer,
  targetTier integer,
  targetLevel integer,
  targetSkillEx integer,
  targetSkillNormal integer,
  targetSkillEnhanced integer,
  targetSkillSub integer,
  targetEquip1 integer,
  targetEquip2 integer,
  targetEquip3 integer,
  targetEquipSpecial integer,
  createdAt text not null default current_timestamp,
  updatedAt text not null default current_timestamp
);

create unique index if not exists student_growth_uid on student_growth (uid);
create unique index if not exists student_growth_userId_studentUid on student_growth (userId, studentUid);


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
