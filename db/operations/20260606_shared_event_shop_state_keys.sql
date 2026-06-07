-- Operational SQL. This is not a schema migration.
-- Do not run through db/migrations or pnpm prod:db:migrate.
-- Run manually after compatibility code deploy and timeline_contents.shop_content_uid update.
-- Idempotent: skips users that already have the target shared eventUid.

insert into event_shop_states (
  uid,
  userId,
  eventUid,
  itemQuantities,
  itemPurchaseDays,
  selectedBonusStudentUids,
  enabledStages,
  includeRecruitedStudents,
  existingPaymentItemQuantities,
  includeFirstClear,
  extraStageRuns,
  minigamePlayCount,
  minigamePaymentQuantityMode,
  overriddenRequiredQuantities,
  createdAt,
  updatedAt
)
select
  s.uid || ':857',
  s.userId,
  '857',
  s.itemQuantities,
  s.itemPurchaseDays,
  s.selectedBonusStudentUids,
  s.enabledStages,
  s.includeRecruitedStudents,
  s.existingPaymentItemQuantities,
  s.includeFirstClear,
  s.extraStageRuns,
  s.minigamePlayCount,
  s.minigamePaymentQuantityMode,
  s.overriddenRequiredQuantities,
  s.createdAt,
  s.updatedAt
from event_shop_states s
where s.eventUid = 'main-story-s2-ex-1-1'
  and not exists (
    select 1
    from event_shop_states existing
    where existing.userId = s.userId
      and existing.eventUid = '857'
  );

insert into event_shop_states (
  uid,
  userId,
  eventUid,
  itemQuantities,
  itemPurchaseDays,
  selectedBonusStudentUids,
  enabledStages,
  includeRecruitedStudents,
  existingPaymentItemQuantities,
  includeFirstClear,
  extraStageRuns,
  minigamePlayCount,
  minigamePaymentQuantityMode,
  overriddenRequiredQuantities,
  createdAt,
  updatedAt
)
select
  s.uid || ':854',
  s.userId,
  '854',
  s.itemQuantities,
  s.itemPurchaseDays,
  s.selectedBonusStudentUids,
  s.enabledStages,
  s.includeRecruitedStudents,
  s.existingPaymentItemQuantities,
  s.includeFirstClear,
  s.extraStageRuns,
  s.minigamePlayCount,
  s.minigamePaymentQuantityMode,
  s.overriddenRequiredQuantities,
  s.createdAt,
  s.updatedAt
from event_shop_states s
where s.eventUid = 'steel-continent'
  and not exists (
    select 1
    from event_shop_states existing
    where existing.userId = s.userId
      and existing.eventUid = '854'
  );
