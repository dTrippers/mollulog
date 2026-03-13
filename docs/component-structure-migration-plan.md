# Component Structure Migration Plan

This document fixes the move targets for the `components/primitives`, `components/features/<domain>`, and `routes/*/_components` migration.
It is the classification checkpoint that should be completed before large-scale file moves begin.

## Target Structure

### `app/components/primitives`
- Small reusable UI building blocks with stable visual APIs.
- They should not include domain-specific data logic.

### `app/components/features/<domain>`
- Reusable domain UI composed from primitives.
- They may contain domain-specific data transformation and interaction logic.

### `app/routes/*/_components`
- Route-local composition only used by one route or one route family.
- Keep these close to the route until reuse is proven.

## Classification Rules

### Primitive
- The same component shape is useful across multiple domains.
- Visual variants matter more than domain-specific behavior.
- It can be understood without game-specific context.

### Feature
- The component knows game/domain concepts such as students, raids, events, coupons, or planner items.
- It composes primitives and may include domain-specific state transitions.
- It is reused across more than one route or likely to be reused inside the same domain.

### Route-local
- The component is a screen assembly layer.
- It exists to wire loader data, actions, and route-specific state together.
- Reuse is weak or accidental.

## Move Targets

### Primitive candidates
- `app/components/primitives/Button.tsx`
- `app/components/primitives/ClickableSurface.tsx`
- `app/components/primitives/Field.tsx`
- `app/components/primitives/Panel.tsx`
- `app/components/atoms/layout/BottomSheet.tsx`
- `app/components/atoms/form/Toggle.tsx`
- `app/components/atoms/navigation/Pagination.tsx`
- `app/components/atoms/typography/Title.tsx`
- `app/components/atoms/typography/SubTitle.tsx`
- `app/components/atoms/typography/Description.tsx`
- `app/components/atoms/typography/EmptyView.tsx`
- `app/components/atoms/typography/Callout.tsx`
- `app/components/atoms/typography/MultilineText.tsx`
- `app/components/atoms/typography/KeyValueTable.tsx`
- `app/components/atoms/student/OptionBadge.tsx`
- `app/components/atoms/student/ProfileImage.tsx`
- `app/components/atoms/student/TagIcon.tsx`
- `app/components/atoms/item/ItemCard.tsx`
- `app/components/atoms/item/ResourceCard.tsx`
- `app/components/ui/HorizontalScroll.tsx`
- `app/components/navigation/FilterButtons.tsx`
- `app/components/navigation/PageLink.tsx`
- `app/components/navigation/PagePanel.tsx`
- `app/components/navigation/PageScreenSelector.tsx`
- `app/components/event/shop/Tabs.tsx`

### Feature: `students`
- `app/components/students/StudentCard.tsx`
- `app/components/students/StudentCards.tsx`
- `app/components/students/StudentFilter.tsx`
- `app/components/students/RecruitmentHistories.tsx`
- `app/components/molecules/student/StudentSearchInput.tsx`
- `app/components/molecules/student/StudentInfo.tsx`
- `app/components/molecules/student/StudentGradingComments.tsx`
- `app/components/molecules/student/TierSelector.tsx`
- `app/components/molecules/student/TierCounts.tsx`
- `app/components/molecules/student/ResourceCards.tsx`

### Feature: `relationship`
- `app/components/relationship/RelationshipStudentPicker.tsx`
- `app/components/relationship/FavoriteItemSelector.tsx`
- `app/components/relationship/FavoritedItemSelector.tsx`
- `app/components/relationship/RequiredGifts.tsx`
- `app/components/relationship/StudentRelationshipLevel.tsx`

### Feature: `raids`
- `app/components/raids/RaidSelector.tsx`
- `app/components/raids/RaidCard.tsx`
- `app/components/raids/RaidRankFilter.tsx`
- `app/components/raids/RaidRankFilterStudentSearch.tsx`
- `app/components/raids/RaidRankScreen.tsx`
- `app/components/raids/RaidStatisticsScreen.tsx`
- `app/components/raids/RaidStatisticsSlotCount.tsx`
- `app/components/raids/RaidVideosScreen.tsx`
- `app/components/raids/RaidOftenUsedParties.tsx`
- `app/components/raids/RaidDifficultyComparison.tsx`
- `app/components/raids/RaidStudentComparison.tsx`
- `app/components/raids/RaidClearLevels.tsx`

### Feature: `events`
- `app/components/event/EventHeader.tsx`
- `app/components/event/EventInfoCard.tsx`
- `app/components/event/EventList.tsx`
- `app/components/event/EventRecruitment.tsx`
- `app/components/event/Recruitments.tsx`
- `app/components/event/EventItemBonus.tsx`
- `app/components/event/EventDetailShopPage.tsx`
- `app/components/event/BattlePassInfo.tsx`
- `app/components/event/shop/*`

### Feature: `contents`
- `app/components/contents/ContentTimeline.tsx`
- `app/components/contents/ContentTimelineItem.tsx`
- `app/components/contents/ContentCommentView.tsx`
- `app/components/contents/ContentCommentEditor.tsx`
- `app/components/contents/CommentView.tsx`
- `app/components/contents/TimelineItemBanner.tsx`

### Feature: `futures`
- `app/components/futures/ContentFilterPanel.tsx`
- `app/components/futures/PyroxenePlannerInputPanel.tsx`
- `app/components/futures/PyroxenePlannerOptionsPanel.tsx`
- `app/components/futures/PyroxeneSchedule.tsx`
- `app/components/futures/planner-input/*`
- `app/components/organisms/future/FuturePlan.tsx`

### Feature: `auth`
- `app/components/molecules/auth/SignInBottomSheet.tsx`

### Feature: `coupons`
- `app/components/coupons/CopyField.tsx`
- `app/components/coupons/CouponCard.tsx`
- `app/components/coupons/CouponRewardList.tsx`

### Feature: `editor`
- `app/components/molecules/editor/ActionCard.tsx`
- `app/components/molecules/editor/AddContentButton.tsx`
- `app/components/molecules/editor/PartyUnitEditor.tsx`
- `app/components/organisms/party/PartyGenerator.tsx`
- `app/components/organisms/party/PartyView.tsx`
- `app/components/organisms/pickup/PickupHistoryEditor.tsx`
- `app/components/organisms/pickup/PickupHistoryImporter.tsx`
- `app/components/organisms/pickup/PickupHistoryView.tsx`

### Feature: `profile`
- `app/components/molecules/profile/ProfileUsername.tsx`
- `app/components/organisms/profile/ProfileCard.tsx`
- `app/components/organisms/profile/ProfileEditor.tsx`

### Feature: `layout`
- `app/components/navigation/Page.tsx`
- `app/components/navigation/NavigationBar.tsx`
- `app/components/organisms/base/Footer.tsx`
- `app/components/organisms/error/ErrorPage.tsx`

## Route-local candidates

### `routes/events.$uid/_components`
- Event detail page composition wrappers that only bridge loader data into event feature components.
- Any remaining one-off helpers created during migration should live here instead of `app/components/event`.

### `routes/raids.$id/_components`
- Screen-only wrappers around rank/statistics/videos tabs.
- Filters or panels that only exist for one raid screen variant should move here instead of staying globally shared.

### `routes/utils.relationship/_components`
- Route-only layout or explanatory panels around relationship calculators.
- Keep shared pickers and item selectors in `features/relationship`.

### `routes/futures/_components`
- Timeline page scaffolding, saved-state banners, or planner-only wrappers with no reuse outside the futures screens.

### `routes/$username.* / routes/edit.* / routes/students.$id.*`
- Screen assembly components that currently live under `organisms/*` should move here if they are not genuinely cross-route reusable.

## Explicit non-goals for the move
- Do not redesign domain behavior during file moves.
- Do not introduce a second export layer that preserves `atoms/molecules/organisms` indefinitely.
- Do not promote single-route helpers into `features` just to avoid import churn.

## Move order
1. Move primitive candidates and update imports.
2. Move clearly reusable feature candidates by domain.
3. Move route-only composition into `routes/*/_components`.
4. Delete obsolete barrel files and legacy folders.
