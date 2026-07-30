alter table event_shop_states
  add column bonusStudentSelectionMode text not null default 'shared';

alter table event_shop_states
  add column selectedBonusStudentUidsByItem text not null default '{}';
