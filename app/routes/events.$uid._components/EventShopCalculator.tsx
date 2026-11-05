import { BoltIcon, CalculatorIcon, ChevronDownIcon, ListBulletIcon, UserIcon } from "@heroicons/react/16/solid";
import { UserIcon as UserOutlineIcon } from "@heroicons/react/24/outline";
import Decimal from "decimal.js";
import hangul from "hangul-js";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useMatches, useOutletContext } from "react-router";
import { ShopSection } from "~/components/v2/features/events/ShopSection";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { AsideLinks, PageAside, PageMain, PanelSheet, useV2Page } from "~/components/v2/layout";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Popover } from "~/components/v2/primitives/Popover";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { useSignIn } from "~/contexts/SignInProvider";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { CARD_FLIP_STRATEGIES, type MinigameConfig } from "~/domain/event-shop";
import {
  calculateEffectiveShopPurchaseCount,
  getShopResourcePurchaseDaysLimit,
  isDailyResetShopResource,
} from "~/domain/event-shop/calculations";
import {
  type BreakdownLine,
  buildResourceBreakdownLines,
} from "~/domain/event-shop/calculations/resource-breakdown-lines";
import { calculateBoughtResourceQuantities } from "~/domain/event-shop/calculations/shop-rewards";
import { getJankenResourceRoles } from "~/domain/event-shop/janken";
import { calculateMinigameRewards, hasVariableMinigamePayment, resourceCountLabel } from "~/domain/event-shop/utils";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { formatInstant, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import {
  cardFlipLocale,
  formatResourceAmount,
  jankenLocale,
  minigameDescription,
  roadPuzzleLocale,
  treasureHuntLocale,
} from "~/locales/ko";
import type { ShopAvailableEvent } from "~/models/event-content";
import { RoadPuzzleShopSection } from "./RoadPuzzleShopSection";
import { ShopMobileResultBar } from "./ShopMobileResultBar";

const noFavorite = { visible: false, icon: "unfavorited" as const, countText: null, accessibleName: "관심 학생" };

type EventRouteData = {
  status: "ready";
  shopAvailableEvents: ShopAvailableEvent[];
  shopEventsUnavailable?: boolean;
};

export default function EventShopCalculator() {
  const plan = useOutletContext<EventShopPlanContext>();
  const matches = useMatches();
  const eventRouteData = matches.find((match) => match.id === "routes/events.$uid")?.data as EventRouteData | undefined;
  const events = eventRouteData?.status === "ready" ? eventRouteData.shopAvailableEvents : [];
  const { stacked, openSheet } = useV2Page();
  const bonusStudents = useMemo(() => {
    const students = new Map<string, string>();
    for (const bonus of plan.eventRewardBonus) {
      for (const { student } of bonus.rewardBonuses) students.set(student.uid, student.name);
    }
    return [...students].map(([uid, name]) => ({ uid, name }));
  }, [plan.eventRewardBonus]);
  const bonusItems = plan.eventRewardBonus.filter(({ rewardBonuses }) => rewardBonuses.length > 0);
  const [bonusView, setBonusView] = useState<"student" | "item">("student");
  const [currencyUid, setCurrencyUid] = useState(
    plan.collectableResources.find(({ forPayment }) => forPayment)?.uid ?? "",
  );
  const paymentResources = plan.collectableResources.filter(({ forPayment }) => forPayment);
  const activeCurrencyUid = paymentResources.some(({ uid }) => uid === currencyUid)
    ? currencyUid
    : (paymentResources[0]?.uid ?? "");
  const visibleShopResources = plan.shopResources.filter(
    (item) =>
      item.paymentResource.uid === activeCurrencyUid ||
      item.purchaseTiers.some((tier) => tier.paymentResource.uid === activeCurrencyUid),
  );
  const minigame = plan.minigameConfig;
  const [showCompletedTreasureHuntRound, setShowCompletedTreasureHuntRound] = useState(
    plan.state.minigameStartRound > 1,
  );
  const paymentModeNeeded = minigame ? hasVariableMinigamePayment(minigame) : false;
  const ap = plan.stageCalculations.totalApWithExtras;
  const hasBonusSelection =
    plan.state.selectedBonusStudentUids.length > 0 ||
    Object.values(plan.state.selectedBonusStudentUidsByItem).some((uids) => uids.length > 0);
  const hasVisibleShopSelection = visibleShopResources.some(
    ({ uid }) => (plan.state.itemQuantities[uid] ?? 0) > 0 || (plan.state.itemPurchaseDays[uid] ?? 0) > 0,
  );

  const chooseAllBonusStudents = () => {
    const uids = bonusStudents.map(({ uid }) => uid);
    plan.actions.setBonusStudents(uids);
    if (plan.state.bonusStudentSelectionMode === "perItem") {
      plan.actions.setBonusStudentsForItems(
        bonusItems.map(({ uid }) => uid),
        uids,
      );
    }
  };
  const clearBonusStudents = () => {
    plan.actions.setBonusStudents([]);
    if (plan.state.bonusStudentSelectionMode === "perItem") {
      plan.actions.setBonusStudentsForItems(
        bonusItems.map(({ uid }) => uid),
        [],
      );
    }
  };
  const applyRecruitedStudents = () => {
    const next = [...new Set([...plan.state.selectedBonusStudentUids, ...plan.recruitedStudentUids])];
    plan.actions.setBonusStudents(next);
    if (plan.state.bonusStudentSelectionMode === "perItem") {
      const itemUids = bonusItems.map(({ uid }) => uid);
      for (const studentUid of plan.recruitedStudentUids) {
        plan.actions.setBonusStudentForItems(itemUids, studentUid, true);
      }
    }
  };
  const handleMinigamePlayCountChange = (count: number) => {
    plan.actions.setMinigamePlayCount(count);
    if (
      (minigame?.minigameType === "clue_search" || minigame?.minigameType === "treasure_hunt") &&
      (count === 0 || plan.state.minigameStartRound > count)
    ) {
      plan.actions.setMinigameStartRound(Math.max(1, count));
    }
  };

  return (
    <>
      <PageMain>
        <div className={`space-y-v2-section-gap ${stacked ? "pb-28" : ""}`}>
          {bonusStudents.length > 0 ? (
            <ShopSection
              title="학생 보너스"
              variant="shop"
              persistenceKey="event-shop-section::student-bonus-selector"
              footer={
                <>
                  <Button
                    size="sm"
                    disabled={!plan.signedIn || plan.recruitedStudentUids.length === 0}
                    onClick={applyRecruitedStudents}
                  >
                    모집 학생 반영
                  </Button>
                  <Button size="sm" variant="primary" onClick={chooseAllBonusStudents}>
                    모두 선택
                  </Button>
                  {hasBonusSelection ? (
                    <Button size="sm" variant="danger-subtle" onClick={clearBonusStudents}>
                      초기화
                    </Button>
                  ) : null}
                </>
              }
            >
              <div>
                <SectionTabs
                  label="학생 보너스 보기"
                  selectedId={bonusView}
                  onChange={(id) => setBonusView(id as "student" | "item")}
                  items={[
                    { id: "student", label: "학생별" },
                    { id: "item", label: "아이템별" },
                  ]}
                />
                {bonusView === "student" ? (
                  <>
                    {plan.state.bonusStudentSelectionMode === "perItem" ? (
                      <p className="my-3 rounded-md bg-v2-surface p-v2-tile-p text-sm text-v2-fg-secondary">
                        아이템마다 서로 다른 보너스 학생을 선택했어요. 아이템별 탭에서 확인해주세요.
                      </p>
                    ) : null}
                    <div className="grid grid-cols-8 gap-v2-block-gap md:grid-cols-12">
                      {bonusStudents.map(({ uid, name }) => {
                        const selected =
                          plan.state.bonusStudentSelectionMode === "shared"
                            ? plan.state.selectedBonusStudentUids.includes(uid)
                            : bonusItems.every(({ uid: itemUid }) =>
                                (
                                  plan.state.selectedBonusStudentUidsByItem[itemUid] ??
                                  plan.state.selectedBonusStudentUids
                                ).includes(uid),
                              );
                        const recruited = plan.recruitedStudentUids.includes(uid);
                        return (
                          <StudentThumb
                            key={uid}
                            studentUid={uid}
                            name={name}
                            variant={null}
                            recruitmentLabel={recruited ? "모집" : ""}
                            isNew={false}
                            favorite={noFavorite}
                            onSelect={() => {
                              if (plan.state.bonusStudentSelectionMode === "shared")
                                plan.actions.toggleBonusStudent(uid);
                              else
                                plan.actions.setBonusStudentForItems(
                                  bonusItems.map(({ uid: itemUid }) => itemUid),
                                  uid,
                                  !selected,
                                );
                            }}
                            selected={selected}
                            selectedIndicatorPosition="mobile-bottom-left"
                            fluid
                            captionPlacement="overlay"
                            grayscaleWhenUnselected
                            showRecruitmentLabel={recruited}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-4">
                      <BonusSummary plan={plan} />
                    </div>
                  </>
                ) : (
                  <div className="mt-4">
                    <ItemBonusView plan={plan} bonusItems={bonusItems} />
                  </div>
                )}
              </div>
            </ShopSection>
          ) : null}

          <ShopSection
            title="상점 아이템"
            variant="shop"
            persistenceKey="event-shop-section::shop-resource-selector"
            footer={
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setVisibleShopResources(visibleShopResources, true, plan)}
                >
                  모두 선택
                </Button>
                {hasVisibleShopSelection ? (
                  <Button
                    size="sm"
                    variant="danger-subtle"
                    onClick={() => resetVisibleShopResources(visibleShopResources, plan)}
                  >
                    초기화
                  </Button>
                ) : null}
              </>
            }
          >
            <div>
              <SectionTabs
                label="상점 결제 재화"
                selectedId={activeCurrencyUid}
                onChange={setCurrencyUid}
                items={paymentResources.map((resource) => ({
                  id: resource.uid,
                  label: resource.name,
                  icon: (
                    <ResourceThumb
                      itemUid={resource.uid}
                      resourceType={resource.type}
                      name={resource.name}
                      imageUrl={resource.imageUrl ?? undefined}
                      size="sm"
                      bare
                      tooltip
                    />
                  ),
                }))}
              />
              <div className="grid grid-cols-2 gap-v2-block-gap lg:grid-cols-4">
                {visibleShopResources.map((item) => (
                  <ShopItemTile key={item.uid} item={item} plan={plan} />
                ))}
              </div>
            </div>
          </ShopSection>

          {minigame ? (
            <ShopSection
              title={minigameTitle(minigame.minigameType)}
              variant="shop"
              persistenceKey="event-shop-section::mini-game"
            >
              {minigame.minigameType === "road_puzzle" ? (
                <RoadPuzzleShopSection plan={plan} config={minigame} />
              ) : minigame.minigameType === "janken" ? (
                <JankenShopSection plan={plan} config={minigame} />
              ) : (
                <div className="space-y-v2-group-gap">
                  <label htmlFor="event-minigame-count" className="block space-y-1 text-sm text-v2-fg">
                    <span className="block font-medium">{minigameCountLabel(minigame.minigameType)}</span>
                    <NumberInput
                      id="event-minigame-count"
                      grouped
                      showMin={false}
                      showMax={false}
                      className="w-full"
                      min={0}
                      value={plan.state.minigamePlayCount}
                      onValueChange={handleMinigamePlayCountChange}
                    />
                  </label>
                  {minigame.minigameType === "clue_search" ? (
                    <label htmlFor="event-minigame-start-round" className="block space-y-1 text-sm text-v2-fg">
                      <span className="block font-medium">시작 회차</span>
                      <NumberInput
                        id="event-minigame-start-round"
                        grouped
                        showMin={false}
                        showMax={false}
                        className="w-full"
                        min={1}
                        max={plan.state.minigamePlayCount || undefined}
                        value={plan.state.minigameStartRound}
                        onValueChange={plan.actions.setMinigameStartRound}
                      />
                    </label>
                  ) : null}
                  {minigame.minigameType === "treasure_hunt" ? (
                    <>
                      <Switch
                        id="event-minigame-exclude-completed"
                        checked={showCompletedTreasureHuntRound}
                        onCheckedChange={(checked) => {
                          setShowCompletedTreasureHuntRound(checked);
                          if (!checked) plan.actions.setMinigameStartRound(1);
                        }}
                        label={treasureHuntLocale.excludeCompleted}
                      />
                      {showCompletedTreasureHuntRound ? (
                        <label htmlFor="event-minigame-completed-round" className="block space-y-1 text-sm text-v2-fg">
                          <span className="block font-medium">{treasureHuntLocale.completedRound}</span>
                          <NumberInput
                            id="event-minigame-completed-round"
                            grouped
                            showMin={false}
                            showMax={false}
                            className="w-full"
                            min={0}
                            max={Math.max(0, plan.state.minigamePlayCount - 1)}
                            value={Math.max(0, plan.state.minigameStartRound - 1)}
                            onValueChange={(round) => plan.actions.setMinigameStartRound(round + 1)}
                          />
                          <p className="text-xs text-v2-fg-tertiary">{treasureHuntLocale.completedRoundHelp}</p>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  {paymentModeNeeded ? (
                    <div className="flex flex-wrap gap-v2-block-gap">
                      {(["min", "expected", "max"] as const).map((mode) => (
                        <ToggleChip
                          key={mode}
                          pressed={plan.state.minigamePaymentQuantityMode === mode}
                          onPressedChange={() => plan.actions.setMinigamePaymentQuantityMode(mode)}
                        >
                          {mode === "min" ? "최소" : mode === "expected" ? "기대" : "최대"}
                        </ToggleChip>
                      ))}
                    </div>
                  ) : null}
                  {minigame.minigameType === "card_flip" ? (
                    <>
                      <div className="flex flex-wrap gap-v2-block-gap">
                        {CARD_FLIP_STRATEGIES.map((strategy) => (
                          <ToggleChip
                            key={strategy}
                            pressed={plan.state.cardFlipStrategy === strategy}
                            onPressedChange={() => plan.actions.setCardFlipStrategy(strategy)}
                          >
                            {cardFlipLocale.strategies[strategy].shortLabel}
                          </ToggleChip>
                        ))}
                      </div>
                      <p className="text-xs text-v2-fg-tertiary">
                        {cardFlipLocale.strategies[plan.state.cardFlipStrategy].shortLabel} ·{" "}
                        {cardFlipLocale.strategies[plan.state.cardFlipStrategy].rule(
                          minigame.cardFlip?.status === "available" ? minigame.cardFlip.drawRules.maxDrawCount : 4,
                        )}
                      </p>
                    </>
                  ) : minigameDescription(minigame.minigameType) ? (
                    <p className="text-xs text-v2-fg-tertiary">{minigameDescription(minigame.minigameType)}</p>
                  ) : null}
                  {plan.state.minigamePlayCount > 0 ? <MinigameResourceBlocks plan={plan} /> : null}
                  {minigame.minigameType === "card_flip" ? (
                    <AsideLinks
                      items={[
                        {
                          key: "card-flip-strategy",
                          title: "전략 비교와 카드별 보상 보기",
                          description: "전략별 소비 재화·기대 획득 보상과 카드별 구성을 확인해보세요",
                          Icon: CalculatorIcon,
                          to: `/events/${plan.eventUid}/shop/card-flip`,
                        },
                      ]}
                    />
                  ) : null}
                </div>
              )}
            </ShopSection>
          ) : null}

          <ShopSection title="스테이지 소탕 계획" variant="shop" persistenceKey="event-shop-section::stage-selector">
            <div className="space-y-v2-group-gap">
              <Switch
                id="event-shop-first-clear"
                checked={plan.state.includeFirstClear}
                onCheckedChange={plan.actions.setIncludeFirstClear}
                label="초회 보상 포함"
                layout="inline"
              />
              {plan.roadPuzzlePlannerStatus ? (
                <RoadPuzzlePlannerStatus plan={plan} pendingText={roadPuzzleLocale.plannerPending} />
              ) : (
                <div className="grid grid-cols-1 gap-v2-block-gap md:grid-cols-2">
                  {plan.stages
                    .filter(({ difficulty }) => difficulty === 1)
                    .sort((a, b) => Number.parseInt(a.index, 10) - Number.parseInt(b.index, 10))
                    .map((stage) => (
                      <StageCard key={stage.uid} stage={stage} plan={plan} />
                    ))}
                </div>
              )}
            </div>
          </ShopSection>

          <ShopSection title="최종 결과" variant="shop" persistenceKey="event-shop-section::collected-totals">
            <ResourceResults plan={plan} />
          </ShopSection>
        </div>
        <ShopMobileResultBar
          plan={plan}
          ap={ap}
          onEventPicker={events.length > 1 ? () => openSheet("events") : undefined}
        />
      </PageMain>
      <PageAside>
        <PanelSheet panelId="result" title="계산 결과" Icon={CalculatorIcon}>
          <ShopResultContents plan={plan} />
        </PanelSheet>
        {events.length > 1 ? (
          <PanelSheet panelId="events" title="이벤트 선택" Icon={ListBulletIcon} collapsible defaultExpanded={false}>
            <EventShopPicker events={events} currentEventUid={plan.eventUid} stacked={stacked} />
          </PanelSheet>
        ) : null}
      </PageAside>
    </>
  );
}

function JankenShopSection({ plan, config }: { plan: EventShopPlanContext; config: MinigameConfig }) {
  const janken = config.janken ?? { status: "unavailable" as const };
  const liveEntry = plan.jankenEntry;
  const goals = liveEntry.goals;
  const planned = plan.jankenPlan;
  const hasGoals =
    goals.targetTier != null ||
    goals.targetScore != null ||
    goals.targetEquipmentTier != null ||
    goals.shopCurrencyMode === "manual";
  const settings = (
    <AsideLinks
      items={[
        {
          key: "janken-planner",
          title: jankenLocale.shopPlanner,
          description: hasGoals ? jankenLocale.shopPlannerDescription : jankenLocale.shopPlannerFirstVisitDescription,
          Icon: CalculatorIcon,
          to: `/events/${plan.eventUid}/shop/janken`,
        },
      ]}
    />
  );
  if (planned.status === "score-input-required") {
    return (
      <div className="space-y-v2-group-gap">
        <StatusNotice tone="warning">{jankenLocale.shopAverageMissingWarning}</StatusNotice>
        {settings}
      </div>
    );
  }
  if (janken.status !== "available" || planned.status !== "available") {
    return (
      <div className="space-y-v2-group-gap">
        <StatusNotice tone={janken.status === "invalid" || planned.status === "invalid" ? "danger" : "neutral"}>
          {janken.status === "invalid" || planned.status === "invalid"
            ? jankenLocale.invalid
            : jankenLocale.unavailable}
        </StatusNotice>
        {settings}
      </div>
    );
  }

  const roles = getJankenResourceRoles(
    janken,
    plan.shopResources.map(({ paymentResource }) => paymentResource.uid),
    plan.jankenStudentGrowthUid ?? null,
  );
  const stageLabel = (stage: (typeof janken.stages)[number]) =>
    stage.stageType === "story"
      ? jankenLocale.storyStage(stage.stageNumber)
      : stage.stageType === "normal"
        ? jankenLocale.normalStage(stage.stageNumber)
        : jankenLocale.challengeStage;
  const playedStages = janken.stages.filter((stage) => (planned.stagePlays[stage.uid] ?? 0) > 0);
  const challenge = janken.stages.find(({ stageType }) => stageType === "challenge");
  const challengePlayCount = challenge ? (planned.stagePlays[challenge.uid] ?? 0) : 0;
  const targetLabels = [
    ...(goals.shopCurrencyMode === "linked"
      ? [jankenLocale.shopCurrencyTarget]
      : goals.manualShopCurrency > 0
        ? [jankenLocale.shopCurrencyTargetAmount(goals.manualShopCurrency)]
        : []),
    ...(goals.targetTier == null ? [] : [jankenLocale.studentGoalTarget(jankenLocale.tierLabel(goals.targetTier))]),
    ...(goals.targetScore == null ? [] : [jankenLocale.scoreGoalTarget(goals.targetScore)]),
    ...(goals.targetEquipmentTier == null ? [] : [jankenLocale.equipmentGoalTarget(goals.targetEquipmentTier)]),
  ];
  const rewardItems = [
    ...janken.stages.flatMap((stage) => stage.rewards),
    ...janken.scoreRewards.flatMap((tier) => tier.rewards),
  ];
  const firstRewardByUid = new Map<string, (typeof rewardItems)[number]>();
  for (const reward of rewardItems)
    if (!firstRewardByUid.has(reward.resourceUid)) firstRewardByUid.set(reward.resourceUid, reward);
  const roleOrder = [roles.studentUid, roles.shopUid, roles.equipmentUid].filter((uid): uid is string => uid !== null);
  const rewards = Object.entries(planned.rewards)
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => {
      const leftRole = roleOrder.indexOf(left);
      const rightRole = roleOrder.indexOf(right);
      if (leftRole >= 0 || rightRole >= 0)
        return (leftRole < 0 ? Infinity : leftRole) - (rightRole < 0 ? Infinity : rightRole);
      return (
        rewardItems.findIndex(({ resourceUid }) => resourceUid === left) -
        rewardItems.findIndex(({ resourceUid }) => resourceUid === right)
      );
    });
  const score = liveEntry.progress.cumulativeScore;
  const projectedScore = score + challengePlayCount * (goals.averageScore ?? 0);
  const formatQuantity = (quantity: number) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(quantity);

  return (
    <div className="space-y-v2-group-gap">
      <section className="rounded-lg bg-v2-surface p-v2-block-p">
        <header className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{jankenLocale.playCount}</h3>
          <span className="text-xs text-v2-fg-tertiary">{jankenLocale.shopPlanCalculated}</span>
        </header>
        <p className="mt-2 text-xs text-v2-fg-secondary">
          {jankenLocale.shopTargetSummary(targetLabels.length > 0 ? targetLabels : [jankenLocale.shopCurrencyTarget])}
        </p>
        <ul className="mt-3 divide-y divide-v2-divider">
          {playedStages.map((stage) => (
            <li key={stage.uid} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <span className="whitespace-nowrap rounded-md bg-v2-inset px-2 py-1 text-sm font-medium">
                {stageLabel(stage)}
              </span>
              <span className="flex items-center gap-3 text-sm tabular-nums">
                <span>{jankenLocale.playCountBadge(planned.stagePlays[stage.uid] ?? 0)}</span>
                <span className="flex items-center gap-1 text-v2-fg-secondary">
                  <ResourceThumb itemUid={stage.entryCost.resourceUid} name={jankenLocale.entryCurrency} size="sm" />
                  {(stage.entryCost.quantity * (planned.stagePlays[stage.uid] ?? 0)).toLocaleString()}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      {settings}
      {challengePlayCount > 0 ? (
        <p className="text-sm font-medium">{jankenLocale.shopScoreBasis(score, projectedScore)}</p>
      ) : null}
      {playedStages.length > 0 ? (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-v2-surface p-v2-block-p">
            <p className="text-xs text-v2-fg-secondary">{jankenLocale.entryCurrencyRequired}</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums">
              {planned.entryResourceUid ? (
                <ResourceThumb itemUid={planned.entryResourceUid} name={jankenLocale.entryCurrency} size="sm" />
              ) : null}
              {planned.entryCost.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-v2-surface p-v2-block-p">
            <p className="text-xs text-v2-fg-secondary">{jankenLocale.expectedRewards}</p>
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rewards.map(([uid, quantity]) => {
                const reward = firstRewardByUid.get(uid);
                if (!reward) return null;
                return (
                  <li key={uid} className="flex items-center justify-center rounded-md bg-v2-inset p-2">
                    <ResourceThumb
                      itemUid={uid}
                      resourceType={reward.resourceType}
                      name={reward.resourceName}
                      imageUrl={reward.imageUrl ?? undefined}
                      rarity={reward.rarity ?? null}
                      label={formatQuantity(quantity)}
                      tooltip
                      nameTooltip
                      size="lg"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BonusSummary({ plan }: { plan: EventShopPlanContext }) {
  return (
    <div className="grid grid-cols-2 gap-v2-block-gap rounded-md bg-v2-surface p-v2-tile-p md:grid-cols-3">
      {plan.bonusSummary?.map((bonus) => (
        <div key={bonus.uid} className="flex min-w-0 items-center gap-2 text-sm tabular-nums">
          <ResourceThumb
            itemUid={bonus.uid}
            resourceType={ResourceTypeEnum.Item}
            name={plan.eventRewardBonus.find(({ uid }) => uid === bonus.uid)?.name}
            rarity={1}
            tooltip
          />
          <div className="min-w-0">
            <p>적용 : {bonus.appliedStrikerRatio.plus(bonus.appliedSpecialRatio).mul(100).toFixed(0)}%</p>
            <p className="text-v2-fg-tertiary">
              최대 : {bonus.maxStrikerRatio.plus(bonus.maxSpecialRatio).mul(100).toFixed(0)}%
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemBonusView({
  plan,
  bonusItems,
}: {
  plan: EventShopPlanContext;
  bonusItems: EventShopPlanContext["eventRewardBonus"];
}) {
  return (
    <div className="space-y-v2-group-gap">
      <div className="flex flex-wrap gap-v2-block-gap">
        <ToggleChip
          pressed={plan.state.bonusStudentSelectionMode === "shared"}
          onPressedChange={(pressed) =>
            pressed &&
            plan.actions.setBonusStudentSelectionMode(
              "shared",
              bonusItems.map(({ uid }) => uid),
            )
          }
        >
          모든 아이템 동일
        </ToggleChip>
        <ToggleChip
          pressed={plan.state.bonusStudentSelectionMode === "perItem"}
          onPressedChange={(pressed) =>
            pressed &&
            plan.actions.setBonusStudentSelectionMode(
              "perItem",
              bonusItems.map(({ uid }) => uid),
            )
          }
        >
          아이템마다 다르게
        </ToggleChip>
      </div>
      {bonusItems.map((item) => {
        const summary = plan.bonusSummary?.find(({ uid }) => uid === item.uid);
        const applied = summary?.appliedStrikerRatio.plus(summary.appliedSpecialRatio).mul(100).toFixed(0) ?? "0";
        const maximum = summary?.maxStrikerRatio.plus(summary.maxSpecialRatio).mul(100).toFixed(0) ?? "0";
        return (
          <section key={item.uid} className="space-y-v2-block-gap">
            <div className="flex min-w-0 items-center gap-2">
              <ResourceThumb
                itemUid={item.uid}
                resourceType={ResourceTypeEnum.Item}
                name={item.name}
                size="sm"
                bare
                tooltip
              />
              <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-v2-fg">{item.name}</h3>
              <p className="shrink-0 text-xs tabular-nums text-v2-fg-tertiary">
                <span className="font-medium text-v2-fg">적용 {applied}%</span> / 최대 {maximum}%
              </p>
            </div>
            <BonusRoleRow studentRole="striker" label="스트라이커" item={item} plan={plan} />
            <BonusRoleRow studentRole="special" label="스페셜" item={item} plan={plan} />
          </section>
        );
      })}
    </div>
  );
}

function BonusRoleRow({
  studentRole,
  label,
  item,
  plan,
}: {
  studentRole: "striker" | "special";
  label: string;
  item: EventShopPlanContext["eventRewardBonus"][number];
  plan: EventShopPlanContext;
}) {
  const students = item.rewardBonuses
    .filter(({ student }) => student.role.toLowerCase() === studentRole)
    .sort((a, b) => Number(b.ratio) - Number(a.ratio));
  return (
    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start">
      <p className="text-xs font-medium text-v2-fg-secondary md:w-20 md:shrink-0 md:pt-1">{label}</p>
      <div className="grid min-w-0 flex-1 grid-cols-8 gap-v2-block-gap md:grid-cols-8">
        {students.map(({ student, ratio }) => {
          const selected =
            plan.state.bonusStudentSelectionMode === "shared"
              ? plan.state.selectedBonusStudentUids.includes(student.uid)
              : (plan.state.selectedBonusStudentUidsByItem[item.uid] ?? plan.state.selectedBonusStudentUids).includes(
                  student.uid,
                );
          const recruited = plan.recruitedStudentUids.includes(student.uid);
          return (
            <div key={student.uid} className="min-w-0">
              <StudentThumb
                studentUid={student.uid}
                name={student.name}
                variant={null}
                recruitmentLabel={recruited ? "모집" : ""}
                isNew={false}
                favorite={noFavorite}
                onSelect={() =>
                  plan.state.bonusStudentSelectionMode === "perItem"
                    ? plan.actions.toggleBonusStudentForItem(item.uid, student.uid)
                    : plan.actions.toggleBonusStudent(student.uid)
                }
                selected={selected}
                selectedIndicatorPosition="mobile-bottom-left"
                fluid
                compact
                captionPlacement="overlay"
                grayscaleWhenUnselected
                showRecruitmentLabel={recruited}
              />
              <p className="mt-0.5 text-center text-[0.625rem] font-semibold leading-none tabular-nums text-v2-fg-tertiary">
                {new Decimal(ratio).mul(100).toFixed(0)}%
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventShopPicker({
  events,
  currentEventUid,
  stacked,
}: {
  events: ShopAvailableEvent[];
  currentEventUid: string;
  stacked: boolean;
}) {
  const timeZone = useDisplayTimeZone();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [revealedSpoilers, setRevealedSpoilers] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRevealedSpoilers(parseRevealedSpoilerContentUids(localStorage.getItem(futuresRevealedSpoilerKey)));
    } catch {
      setRevealedSpoilers([]);
    }
  }, []);

  const current = events.find(({ uid }) => uid === currentEventUid);
  const now = nowUtcIso();
  const visibleEvents = events.filter((event) => matchesShopEventSearch(event, query, revealedSpoilers));
  if (!current) return <StatusNotice tone="danger">이벤트 정보를 불러오지 못했어요.</StatusNotice>;
  const currentHidden = current.isSpoiler && !revealedSpoilers.includes(current.uid);
  const status = eventStatus(current, now);
  const eventList =
    visibleEvents.length > 0 ? (
      visibleEvents.map((event) => {
        const hidden = event.isSpoiler && !revealedSpoilers.includes(event.uid);
        return (
          <Link
            key={event.uid}
            to={`/events/${event.uid}/shop`}
            onClick={(clickEvent) => {
              if (event.isSpoiler && !window.confirm("스포일러가 포함된 이벤트에요. 이동할까요?")) {
                clickEvent.preventDefault();
              } else {
                setOpen(false);
              }
            }}
            className="block rounded-md px-3 py-2 hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-v2-focus"
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-v2-fg">
              <span className="truncate">{hidden ? "???" : event.name}</span>
              <span className="shrink-0 text-xs font-normal text-v2-fg-tertiary">{eventStatus(event, now)}</span>
            </span>
            <span className="mt-1 block text-xs text-v2-fg-tertiary">
              {formatInstant(event.since, { timeZone, format: "YYYY.MM.DD" })} ~{" "}
              {event.until ? formatInstant(event.until, { timeZone, format: "MM.DD" }) : "미정"}
            </span>
          </Link>
        );
      })
    ) : (
      <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
    );

  if (stacked) {
    return (
      <div className="space-y-v2-block-gap">
        <SearchInput
          aria-label="이벤트 검색"
          placeholder="이벤트 이름 또는 학생 이름으로 찾기"
          value={query}
          onChange={setQuery}
        />
        <div className="max-h-[60vh] overflow-y-auto">{eventList}</div>
      </div>
    );
  }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-v2-row-min w-full items-center justify-between gap-3 rounded-md text-left text-v2-fg hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{currentHidden ? "???" : current.name}</span>
          <span className="mt-0.5 block text-xs text-v2-fg-tertiary">
            {formatInstant(current.since, { timeZone, format: "YYYY.MM.DD" })} ~{" "}
            {current.until ? formatInstant(current.until, { timeZone, format: "MM.DD" }) : "미정"} · {status}
          </span>
        </span>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-v2-fg-tertiary transition-transform duration-v2-base ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <Popover
        open={open}
        label="이벤트 선택"
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-[min(22rem,calc(100vw-2rem))] p-2"
      >
        <SearchInput
          aria-label="이벤트 검색"
          placeholder="이벤트 이름 또는 학생 이름으로 찾기"
          value={query}
          onChange={setQuery}
        />
        <div className="mt-2 max-h-72 overflow-y-auto">{eventList}</div>
      </Popover>
    </div>
  );
}

function eventStatus(event: ShopAvailableEvent, now: string) {
  return isInstantAfter(event.since, now)
    ? "예정"
    : event.until && isInstantAfter(event.until, now)
      ? "진행 중"
      : "종료";
}

export function matchesShopEventSearch(event: ShopAvailableEvent, query: string, revealedSpoilers: string[]) {
  const hidden = event.isSpoiler && !revealedSpoilers.includes(event.uid);
  const pickupNames = hidden
    ? ""
    : (event.recruitments
        ?.filter(({ pickup }) => pickup)
        .map(({ student }) => student?.name ?? "")
        .join(" ") ?? "");
  return hangul.search(`${hidden ? "???" : event.name} ${pickupNames}`, query.trim()) >= 0;
}

function ShopItemTile({
  item,
  plan,
}: {
  item: EventShopPlanContext["shopResources"][number];
  plan: EventShopPlanContext;
}) {
  const daily = isDailyResetShopResource(item);
  const quantity = plan.state.itemQuantities[item.uid] ?? 0;
  const days = plan.state.itemPurchaseDays[item.uid] ?? 0;
  const maxDays = getShopResourcePurchaseDaysLimit(plan.eventUid, item.uid, plan.availablePurchaseDays);
  const prices = [...new Set(item.purchaseTiers.map(({ unitPrice }) => unitPrice))];
  const price =
    prices.length > 1
      ? `${Math.min(...prices).toLocaleString()}~${Math.max(...prices).toLocaleString()}`
      : (prices[0]?.toLocaleString() ?? "-");
  const payment = item.purchaseTiers[0]?.paymentResource ?? item.paymentResource;
  const maxQuantity = item.shopAmount ?? undefined;
  const owned = plan.ownedQuantities?.[item.uid];
  const students = item.resource.type === ResourceTypeEnum.Furniture ? (item.resource.interactionStudents ?? []) : [];
  const amountLabel = item.resourceAmount === 1 ? undefined : formatResourceAmount(item.resourceAmount);
  const label =
    students.length > 0 ? (
      <>
        <UserOutlineIcon className="size-3" aria-hidden="true" />
        {amountLabel}
      </>
    ) : (
      amountLabel
    );

  return (
    <article className="flex min-w-0 flex-col gap-v2-row-x rounded-md bg-v2-surface p-v2-tile-p">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-v2-media-gap">
        {students.length > 0 ? (
          <FurnitureThumb item={item} students={students} label={label} />
        ) : (
          <ResourceThumb
            itemUid={item.resource.uid}
            resourceType={item.resource.type}
            name={item.resource.name}
            imageUrl={item.resource.imageUrl ?? undefined}
            rarity={item.resource.rarity}
            label={label}
            tooltip
          />
        )}
        <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <div className="flex min-w-0 items-center justify-center gap-1">
            <ResourceThumb
              itemUid={payment.uid}
              resourceType={payment.type}
              name={payment.name}
              imageUrl={payment.imageUrl ?? undefined}
              size="sm"
              bare
              tooltip
            />
            <span className="min-w-0 text-sm font-semibold leading-tight tabular-nums text-v2-fg">
              {price.includes("~") ? (
                <>
                  {price.split("~")[0]}~<wbr />
                  {price.split("~")[1]}
                </>
              ) : (
                price
              )}
            </span>
          </div>
          <p className="break-keep text-xs leading-tight text-v2-fg-tertiary">
            {item.shopAmount === null
              ? "구매 제한 없음"
              : `${daily ? "매일 " : ""}${item.shopAmount.toLocaleString()}회 구매 가능`}
          </p>
          {owned !== undefined && owned !== 0 ? (
            <p className="break-keep text-xs leading-tight text-v2-fg-tertiary">
              보유{" "}
              <span className="whitespace-nowrap font-semibold tabular-nums text-v2-fg">{owned.toLocaleString()}</span>
            </p>
          ) : null}
        </div>
      </div>
      {daily ? (
        <div className="mt-auto space-y-1.5">
          <div className="block space-y-0.5 text-xs text-v2-fg-tertiary">
            <span className="block">하루 구매량</span>
            <NumberInput
              grouped
              aria-label={`${item.resource.name} 하루 구매량`}
              value={quantity}
              min={0}
              max={maxQuantity}
              showMax={maxQuantity !== undefined}
              className="w-full"
              onValueChange={(value) => plan.actions.updateItemQuantity(item.uid, value)}
            />
          </div>
          <div className="block space-y-0.5 text-xs text-v2-fg-tertiary">
            <span className="block">구매 일수</span>
            <NumberInput
              grouped
              aria-label={`${item.resource.name} 구매 일수`}
              value={days}
              min={0}
              max={maxDays}
              showMax={maxDays > 0}
              className="w-full"
              onValueChange={(value) => plan.actions.updateItemPurchaseDay(item.uid, value)}
            />
          </div>
          <p className="text-center text-xs tabular-nums text-v2-fg-tertiary">
            총 {calculateEffectiveShopPurchaseCount(item, quantity, days).toLocaleString()}회 구매
          </p>
        </div>
      ) : (
        <div className="mt-auto">
          <NumberInput
            grouped
            aria-label={`${item.resource.name} 구매량`}
            value={quantity}
            min={0}
            max={maxQuantity}
            showMax={maxQuantity !== undefined}
            className="w-full"
            onValueChange={(value) => plan.actions.updateItemQuantity(item.uid, value)}
          />
        </div>
      )}
    </article>
  );
}

function FurnitureThumb({
  item,
  students,
  label,
}: {
  item: EventShopPlanContext["shopResources"][number];
  students: NonNullable<EventShopPlanContext["shopResources"][number]["resource"]["interactionStudents"]>;
  label: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${item.resource.name} 상호작용 학생 보기`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      >
        <ResourceThumb
          itemUid={item.resource.uid}
          resourceType={item.resource.type}
          name={item.resource.name}
          imageUrl={item.resource.imageUrl ?? undefined}
          rarity={item.resource.rarity}
          label={label}
          tooltip
        />
      </button>
      <Popover
        open={open}
        label={`${item.resource.name} 상호작용 학생`}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-72 p-3"
      >
        <p className="mb-2 text-sm font-medium text-v2-fg">상호작용 학생</p>
        <div className="grid grid-cols-4 gap-v2-block-gap">
          {students.map((student) => (
            <StudentThumb
              key={student.uid}
              studentUid={student.uid}
              name={student.name}
              variant={null}
              recruitmentLabel=""
              isNew={false}
              favorite={noFavorite}
              small
              showRecruitmentLabel={false}
            />
          ))}
        </div>
      </Popover>
    </>
  );
}

function MinigameResourceBlocks({ plan }: { plan: EventShopPlanContext }) {
  const config = plan.minigameConfig;
  if (!config) return null;
  const costs = plan.minigamePaymentCosts ?? [];
  const rewards =
    plan.minigameRewards ??
    calculateMinigameRewards(config, plan.state.minigamePlayCount, plan.state.minigameStartRound);
  return (
    <div className="grid grid-cols-1 gap-v2-block-gap md:grid-cols-2">
      <ResourceBlock title="필요 재화">
        {costs.length > 0 ? (
          costs.map((cost) => (
            <ResourceThumb
              key={`${cost.resourceType}:${cost.resourceUid}`}
              itemUid={cost.resourceUid}
              resourceType={cost.resourceType}
              name={cost.resourceName}
              imageUrl={cost.imageUrl ?? undefined}
              size="md"
              label={resourceCountLabel(cost.quantity)}
              tooltip
            />
          ))
        ) : (
          <p className="text-xs text-v2-fg-tertiary">필요 재화가 없어요</p>
        )}
      </ResourceBlock>
      <ResourceBlock title="평균 획득 보상">
        {rewards.length > 0 ? (
          rewards.map((reward) => (
            <ResourceThumb
              key={`${reward.resourceType}:${reward.resourceUid}`}
              itemUid={reward.resourceUid}
              resourceType={reward.resourceType}
              name={reward.resourceName ?? cardFlipLocale.resourceNameUnavailable}
              imageUrl={reward.imageUrl ?? undefined}
              rarity={reward.rarity}
              size="md"
              label={resourceCountLabel(reward.quantity)}
              tooltip
            />
          ))
        ) : (
          <p className="text-xs text-v2-fg-tertiary">획득 보상이 없어요</p>
        )}
      </ResourceBlock>
    </div>
  );
}

function ResourceBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-v2-surface p-v2-tile-p">
      <h3 className="mb-v2-group-gap text-xs font-semibold text-v2-fg">{title}</h3>
      <div className="flex flex-wrap items-start gap-v2-block-gap">{children}</div>
    </div>
  );
}

function StageCard({ stage, plan }: { stage: EventShopPlanContext["stages"][number]; plan: EventShopPlanContext }) {
  const enabled = !!plan.state.enabledStages[stage.uid];
  const runs = plan.stageCalculations.stageRuns[stage.uid] ?? 0;
  const rewards = stage.rewards.filter(
    ({ item, rewardRequirement, amount }) => item && rewardRequirement === null && amount > 0,
  );
  const coinRewards = rewards.filter(({ item }) => item?.category === "coin");
  const otherRewards = rewards.filter(({ item }) => item?.category !== "coin");
  return (
    <article className="min-w-0 rounded-md bg-v2-surface p-v2-tile-p">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-v2-inset text-sm font-medium tabular-nums text-v2-fg">
          {stage.index}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums text-v2-ap">
            <BoltIcon className="size-3" aria-hidden="true" />
            {stage.entryAp}
          </span>
          {runs > 0 ? (
            <span className="rounded-sm bg-v2-inset px-1.5 text-xs font-medium tabular-nums text-v2-fg">
              {runs.toLocaleString()}회 소탕
            </span>
          ) : null}
        </div>
        <div className="-my-2.5 flex shrink-0 items-center">
          <Switch
            id={`stage-${stage.uid}`}
            checked={enabled}
            onCheckedChange={(checked) => plan.actions.toggleStage(stage.uid, checked)}
            label={`스테이지 ${stage.index}`}
            layout="inline"
            hideLabel
          />
        </div>
      </div>
      {rewards.length > 0 ? (
        <div className="mt-v2-group-gap flex flex-wrap items-start gap-v2-block-gap">
          {coinRewards.map(({ item, amount, chance, rewardRequirement }) =>
            item ? (
              <ResourceThumb
                key={`coin:${item.uid}:${amount}:${chance ?? ""}:${rewardRequirement ?? ""}`}
                itemUid={item.uid}
                resourceType={item.resourceType ?? ResourceTypeEnum.Item}
                name={item.name}
                imageUrl={item.imageUrl ?? undefined}
                rarity={item.rarity}
                size="md"
                label={amount.toLocaleString()}
                tooltip
              />
            ) : null,
          )}
          {coinRewards.map(({ item, amount, chance, rewardRequirement }) => {
            if (!item) return null;
            const bonus = Math.ceil(amount * (plan.appliedBonusRatio[item.uid]?.toNumber() ?? 0));
            return bonus > 0 ? (
              <ResourceThumb
                key={`bonus:${item.uid}:${amount}:${chance ?? ""}:${rewardRequirement ?? ""}`}
                itemUid={item.uid}
                resourceType={item.resourceType ?? ResourceTypeEnum.Item}
                name={`${item.name} 보너스`}
                imageUrl={item.imageUrl ?? undefined}
                rarity={item.rarity}
                size="md"
                label={<span className="text-v2-perk-on-media">+{bonus.toLocaleString()}</span>}
                tooltip
              />
            ) : null;
          })}
          {otherRewards.map(({ item, amount, chance, rewardRequirement }) =>
            item ? (
              <ResourceThumb
                key={`other:${item.uid}:${amount}:${chance ?? ""}:${rewardRequirement ?? ""}`}
                itemUid={item.uid}
                resourceType={item.resourceType ?? ResourceTypeEnum.Item}
                name={item.name}
                imageUrl={item.imageUrl ?? undefined}
                rarity={item.rarity}
                size="md"
                label={amount.toLocaleString()}
                tooltip
              />
            ) : null,
          )}
        </div>
      ) : null}
      {enabled ? (
        <div className="mt-v2-group-gap block space-y-1 text-xs font-medium text-v2-fg-secondary">
          <span className="block">추가 소탕</span>
          <NumberInput
            grouped
            aria-label={`스테이지 ${stage.index} 추가 소탕`}
            value={plan.state.extraStageRuns[stage.uid] ?? 0}
            min={0}
            showMax={false}
            className="w-full"
            onValueChange={(value) => plan.actions.updateExtraRuns(stage.uid, value)}
          />
        </div>
      ) : null}
    </article>
  );
}

export function ShopResultContents({ plan }: { plan: EventShopPlanContext }) {
  const { showSignIn } = useSignIn();
  const reportFetcher = useFetcher<{ success?: boolean; error?: { content?: string } }>();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDescription, setReportDescription] = useState("");
  const calculation = plan.stageCalculations;
  const calculationPending = plan.isCalculating || plan.resultTreasureHuntStatus === "pending";
  const calculationReady =
    !plan.isCalculating && !plan.holdTreasureHuntCalculations && !plan.holdRoadPuzzleCalculations;
  const apBreakdown = [
    ["초회", calculation.firstClearAp],
    ["퀘스트 소탕", calculation.questSweepAp],
    ["추가 소탕", calculation.extraSweepAp],
  ].filter(([, value]) => Number(value) > 0) as [string, number][];
  const status = shopResultStatus(plan);
  return (
    <div className="space-y-v2-group-gap">
      <div>
        <p className="text-xs text-v2-fg-tertiary">필요 AP</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${calculation.totalApWithExtras > 0 ? "text-v2-ap" : "font-normal text-v2-fg-tertiary"}`}
        >
          {calculationPending || !calculationReady ? (
            <span aria-hidden="true">{"\u00a0"}</span>
          ) : calculationReady && calculation.totalApWithExtras > 0 ? (
            calculation.totalApWithExtras.toLocaleString()
          ) : (
            "—"
          )}
        </p>
        {!calculationPending && calculationReady && calculation.totalApWithExtras <= 0 ? (
          <p className="mt-1 text-xs text-v2-fg-tertiary">구매할 아이템을 선택하세요</p>
        ) : null}
        {calculationReady &&
          apBreakdown.map(([label, value]) => (
            <div key={label} className="mt-1 flex justify-between text-xs tabular-nums text-v2-fg-secondary">
              <span>{label}</span>
              <span>{value.toLocaleString()}</span>
            </div>
          ))}
      </div>
      {calculationReady && Object.keys(calculation.unobtainableTargets).length > 0 ? (
        <StatusNotice tone="warning">선택한 스테이지에서 획득할 수 없는 이벤트 재화가 있어요.</StatusNotice>
      ) : null}
      <Link
        to={`/utils/ap?eventUid=${encodeURIComponent(plan.eventUid)}`}
        className="block text-xs font-medium text-v2-link hover:underline"
      >
        AP 플래너에서 보기 →
      </Link>
      <div aria-live="polite">
        {status ? (
          <StatusNotice tone={status.tone} action={status.action}>
            {status.text}
          </StatusNotice>
        ) : null}
      </div>
      <hr className="border-v2-divider" />
      <div className="space-y-v2-group-gap">
        <StatusNotice
          tone="neutral"
          action={
            plan.signedIn ? (
              <Button size="sm" variant="text" onClick={() => setReportOpen(true)}>
                오류 제보
              </Button>
            ) : undefined
          }
        >
          <span title="게임 데이터가 일본 서비스와 다를 수 있어요">데이터가 부정확할 수 있어요</span>
        </StatusNotice>
        {!plan.signedIn ? (
          <StatusNotice
            tone="neutral"
            Icon={UserIcon}
            action={
              <Button size="sm" variant="primary" onClick={showSignIn}>
                로그인
              </Button>
            }
          >
            <span className="break-keep">로그인하면 모집 학생 반영·계정 저장</span>
          </StatusNotice>
        ) : null}
      </div>
      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} title="오류 제보" size="sm">
        {reportFetcher.data?.success ? (
          <div className="space-y-2 text-sm text-v2-fg">
            <p className="font-semibold">제출 완료</p>
            <p className="text-v2-fg-secondary">오류 제보가 성공적으로 제출되었습니다.</p>
            <Button variant="primary" onClick={() => setReportOpen(false)}>
              닫기
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const additional = {
                type: "event_shop_bug_report",
                version: 1,
                payload: {
                  timestamp: nowUtcIso(),
                  eventUid: plan.eventUid,
                  shopStateUid: plan.shopStateUid,
                  savedShopStateSource: plan.savedShopStateSource,
                  stages: plan.stages,
                  shopResources: plan.shopResources,
                  collectableResources: plan.collectableResources,
                  stageCalculations: plan.stageCalculations,
                  shopState: plan.state,
                },
              };
              const body = new FormData();
              body.append("title", `이벤트 상점 계산기 오류 제보 (${plan.eventUid})`);
              body.append("content", reportDescription.trim() || "추가 설명이 입력되지 않았습니다.");
              body.append("additional", JSON.stringify(additional));
              reportFetcher.submit(body, { method: "post", action: "/contact" });
            }}
            className="space-y-3"
          >
            <p className="text-sm text-v2-fg-secondary">
              계산 결과에 오류가 있거나 사용 중 문제가 있는 경우 제보해주세요. 로그 데이터가 서버로 전송됩니다.
            </p>
            <label className="block space-y-1 text-sm text-v2-fg">
              <span>설명 (선택)</span>
              <textarea
                value={reportDescription}
                onChange={(event) => setReportDescription(event.currentTarget.value)}
                rows={4}
                className="w-full rounded-md border border-v2-control-border bg-v2-surface p-2 text-sm text-v2-fg focus:border-v2-control-border-strong"
              />
            </label>
            {reportFetcher.data?.error ? (
              <p role="alert" className="text-sm text-v2-danger">
                오류 제보를 제출하지 못했어요. 잠시 후 다시 시도해주세요.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button disabled={reportFetcher.state === "submitting"} onClick={() => setReportOpen(false)}>
                취소
              </Button>
              <Button type="submit" variant="primary" disabled={reportFetcher.state === "submitting"}>
                {reportFetcher.state === "submitting" ? "제출 중…" : "제출하기"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

function RoadPuzzlePlannerStatus({ plan, pendingText }: { plan: EventShopPlanContext; pendingText: string }) {
  const status = plan.roadPuzzlePlannerStatus;
  if (status === "pending") return <StatusNotice tone="neutral">{pendingText}</StatusNotice>;
  if (status === "missing") return <StatusNotice tone="warning">{roadPuzzleLocale.noData}</StatusNotice>;
  if (status === "failed") {
    return (
      <StatusNotice
        tone="danger"
        action={
          <Button size="sm" onClick={plan.roadPuzzleCalculation.retry}>
            {roadPuzzleLocale.retry}
          </Button>
        }
      >
        {roadPuzzleLocale.plannerFailed}
      </StatusNotice>
    );
  }
  return null;
}

function ResourceResults({ plan }: { plan: EventShopPlanContext }) {
  if (plan.roadPuzzlePlannerStatus) {
    return <RoadPuzzlePlannerStatus plan={plan} pendingText={`${roadPuzzleLocale.calculating}…`} />;
  }
  if (plan.isCalculating || plan.resultTreasureHuntStatus === "pending") {
    return <StatusNotice tone="neutral">계산 중…</StatusNotice>;
  }
  if (plan.holdTreasureHuntCalculations) return null;

  const result = plan.stageCalculations;
  const labels = {
    minigameRequired: plan.resultTreasureHuntStatus === "provisional" ? "미니게임 (계산 중)" : "미니게임",
    minigameAcquired: plan.resultTreasureHuntStatus === "provisional" ? "미니게임 (계산 중)" : "미니게임",
  };
  const shopRewards = calculateBoughtResourceQuantities(
    plan.shopResources,
    plan.state.itemQuantities,
    plan.state.itemPurchaseDays,
  );
  const gameRewards =
    plan.state.minigamePlayCount > 0
      ? (plan.minigameRewards ??
        (plan.minigameConfig
          ? calculateMinigameRewards(plan.minigameConfig, plan.state.minigamePlayCount, plan.state.minigameStartRound)
          : []))
      : [];
  const collected = new Map<
    string,
    { type: ResourceTypeEnum; uid: string; name: string; imageUrl?: string | null; rarity?: number; quantity: number }
  >();
  for (const { resource, totalQuantity } of shopRewards) {
    const key = `${resource.type}:${resource.uid}`;
    const previous = collected.get(key);
    collected.set(key, {
      type: resource.type,
      uid: resource.uid,
      name: resource.name,
      imageUrl: resource.imageUrl,
      rarity: resource.rarity,
      quantity: (previous?.quantity ?? 0) + totalQuantity,
    });
  }
  for (const reward of gameRewards) {
    const key = `${reward.resourceType}:${reward.resourceUid}`;
    const previous = collected.get(key);
    collected.set(key, {
      type: reward.resourceType,
      uid: reward.resourceUid,
      name: reward.resourceName ?? cardFlipLocale.resourceNameUnavailable,
      imageUrl: reward.imageUrl,
      rarity: reward.rarity,
      quantity: (previous?.quantity ?? 0) + reward.quantity,
    });
  }
  return (
    <div className="space-y-v2-group-gap">
      {plan.collectableResources.length > 0 ? (
        <div className="grid grid-cols-1 gap-v2-block-gap md:grid-cols-2">
          {plan.collectableResources.map((resource) => {
            const lines = buildResourceBreakdownLines(
              result.itemBreakdown,
              resource.uid,
              plan.state.overriddenRequiredQuantities,
              labels,
            );
            const existing = result.itemBreakdown.existing[resource.uid] ?? 0;
            const requirement =
              plan.state.overriddenRequiredQuantities[resource.uid] ?? Math.ceil(lines.requiredSubtotal);
            const requiredOverridden = lines.hasOverride;
            return (
              <article
                key={`${resource.type}:${resource.uid}`}
                className="flex h-full min-w-0 flex-col rounded-md bg-v2-surface p-v2-tile-p"
              >
                <div className="flex min-w-0 flex-1 items-start gap-v2-media-gap">
                  <ResourceThumb
                    itemUid={resource.uid}
                    resourceType={resource.type}
                    name={resource.name}
                    imageUrl={resource.imageUrl ?? undefined}
                    rarity={1}
                    size="md"
                    tooltip
                  />
                  <div className="min-w-0 flex-1 space-y-v2-group-gap text-sm">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-v2-fg">필요 수량</span>
                        <span className="font-semibold tabular-nums text-v2-fg">
                          {Math.ceil(lines.actualRequired).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1 pl-2 text-xs text-v2-fg-tertiary">
                        {requiredOverridden ? (
                          <p>
                            <span className="mr-1.5">·</span>입력한 목표 수량
                          </p>
                        ) : (
                          <BreakdownLines lines={lines.requiredLines} round={Math.ceil} />
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-v2-fg">획득 수량</span>
                        <span className="font-semibold tabular-nums text-v2-fg">
                          {Math.floor(lines.acquiredSubtotal).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1 pl-2 text-xs text-v2-fg-tertiary">
                        <BreakdownLines lines={lines.acquiredLines} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-v2-divider pt-2">
                      <span className="font-medium text-v2-fg">{lines.remaining >= 0 ? "남은 수량" : "부족 수량"}</span>
                      <span
                        className={`font-bold tabular-nums ${lines.remaining >= 0 ? "text-v2-success" : "text-v2-danger"}`}
                      >
                        {Math.abs(Math.floor(lines.remaining)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap justify-end gap-2 pt-v2-group-gap">
                  <EditableQuantity
                    label={`${resource.name} 보유 수량`}
                    buttonLabel="보유 수량 입력"
                    accessibleLabel={`${resource.name} 보유 수량 입력`}
                    value={existing}
                    onSave={(value) => plan.actions.updateExistingQuantity(resource.uid, value)}
                    onReset={existing > 0 ? () => plan.actions.updateExistingQuantity(resource.uid, 0) : undefined}
                  />
                  <EditableQuantity
                    label={`${resource.name} 목표 수량`}
                    buttonLabel="목표 수량 입력"
                    accessibleLabel={`${resource.name} 목표 수량 입력`}
                    value={requirement}
                    onSave={(value) => plan.actions.updateOverriddenRequired(resource.uid, value)}
                    onReset={requiredOverridden ? () => plan.actions.resetOverriddenRequired(resource.uid) : undefined}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <StatusNotice tone="neutral">결과 재화 정보가 없어요.</StatusNotice>
      )}
      {collected.size > 0 ? (
        <div className="rounded-md bg-v2-surface p-v2-tile-p">
          <h3 className="text-sm font-medium text-v2-fg">획득 보상</h3>
          <div className="mt-v2-group-gap flex flex-wrap gap-v2-block-gap">
            {[...collected.values()].map((reward) => (
              <ResourceThumb
                key={`${reward.type}:${reward.uid}`}
                itemUid={reward.uid}
                resourceType={reward.type}
                name={reward.name}
                imageUrl={reward.imageUrl ?? undefined}
                rarity={reward.rarity}
                size="md"
                label={resourceCountLabel(reward.quantity)}
                tooltip
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BreakdownLines({ lines, round = Math.floor }: { lines: BreakdownLine[]; round?: (value: number) => number }) {
  if (lines.length === 0) return <p>획득처 없음</p>;
  return (
    <>
      {lines.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-2">
          <span>
            <span className="mr-1.5">·</span>
            {label}
          </span>
          <span className="tabular-nums">{round(value).toLocaleString()}</span>
        </div>
      ))}
    </>
  );
}

function EditableQuantity({
  label,
  buttonLabel,
  accessibleLabel,
  value,
  onSave,
  onReset,
}: {
  label: string;
  buttonLabel: string;
  accessibleLabel: string;
  value: number;
  onSave: (value: number) => void;
  onReset?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editValue, setEditValue] = useState(value);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={accessibleLabel}
        onClick={() => {
          setEditValue(value);
          setOpen(true);
        }}
        className={v2ButtonClassName({ size: "sm" })}
      >
        {buttonLabel}
      </button>
      <Popover
        open={open}
        label={label}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-72"
      >
        <div className="space-y-3">
          <p className="text-sm text-v2-fg-secondary">{label}</p>
          <NumberInput
            grouped
            aria-label={label}
            value={editValue}
            min={0}
            showMax={false}
            className="w-full"
            onValueChange={setEditValue}
          />
          <div className="flex justify-between gap-2">
            {onReset ? (
              <Button
                size="sm"
                variant="danger-subtle"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                초기화
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onSave(editValue);
                  setOpen(false);
                }}
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}

function TreasureHuntResultStatus({ plan }: { plan: EventShopPlanContext }) {
  const status = plan.resultTreasureHuntStatus;
  if (!status) return null;
  if (status === "pending") return { tone: "neutral" as const, text: treasureHuntLocale.pendingResult };
  if (status === "provisional") return { tone: "warning" as const, text: treasureHuntLocale.provisionalResult };
  if (status === "round-limit") return { tone: "warning" as const, text: treasureHuntLocale.roundLimitResult };
  return { tone: "danger" as const, text: treasureHuntLocale.failedResult };
}

function shopResultStatus(
  plan: EventShopPlanContext,
): { tone: "neutral" | "warning" | "danger"; text: string; action?: ReactNode } | null {
  if (plan.saveError)
    return {
      tone: "danger",
      text: plan.saveError,
      action: (
        <Button size="sm" onClick={plan.retrySave}>
          다시 시도
        </Button>
      ),
    };
  if (plan.isSaving) return { tone: "neutral", text: "저장 중…" };
  if (plan.isCalculating) return { tone: "neutral", text: "계산 중…" };
  if (plan.roadPuzzlePlannerStatus === "pending") return { tone: "neutral", text: roadPuzzleLocale.plannerPending };
  if (plan.roadPuzzlePlannerStatus === "missing") return { tone: "warning", text: roadPuzzleLocale.noData };
  if (plan.roadPuzzlePlannerStatus === "failed") {
    return {
      tone: "danger",
      text: roadPuzzleLocale.plannerFailed,
      action: (
        <Button size="sm" onClick={plan.roadPuzzleCalculation.retry}>
          {roadPuzzleLocale.retry}
        </Button>
      ),
    };
  }
  const treasureHuntStatus = TreasureHuntResultStatus({ plan });
  if (treasureHuntStatus?.tone === "danger") {
    return {
      ...treasureHuntStatus,
      action: (
        <Button size="sm" onClick={plan.treasureHuntCalculation.retry}>
          {treasureHuntLocale.retry}
        </Button>
      ),
    };
  }
  return treasureHuntStatus;
}

function minigameTitle(type: string) {
  return (
    (
      {
        clue_search: "단서 찾기",
        dice: "주사위",
        card_flip: "카드 뒤집기",
        treasure_hunt: "보물찾기",
        box_gacha: "상자 뽑기",
        fortune_gacha: "운세 뽑기",
        road_puzzle: roadPuzzleLocale.title,
        janken: jankenLocale.gameTitle,
      } as Record<string, string>
    )[type] ?? "미니게임"
  );
}

function minigameCountLabel(type: string) {
  if (type === "card_flip") return cardFlipLocale.countLabel;
  if (type === "dice") return "주사위 횟수";
  if (type === "clue_search" || type === "treasure_hunt") return treasureHuntLocale.targetRound;
  return "플레이 횟수";
}

function setVisibleShopResources(
  resources: EventShopPlanContext["shopResources"],
  select: boolean,
  plan: EventShopPlanContext,
) {
  plan.actions.updateItemQuantities((previous) => {
    const next = { ...previous };
    for (const item of resources) {
      if (!select || item.shopAmount !== null) next[item.uid] = select ? (item.shopAmount ?? next[item.uid] ?? 0) : 0;
    }
    return next;
  });
  plan.actions.updateItemPurchaseDays((previous) => {
    const next = { ...previous };
    for (const item of resources) {
      if (isDailyResetShopResource(item))
        next[item.uid] = select
          ? getShopResourcePurchaseDaysLimit(plan.eventUid, item.uid, plan.availablePurchaseDays)
          : 0;
    }
    return next;
  });
}

function resetVisibleShopResources(resources: EventShopPlanContext["shopResources"], plan: EventShopPlanContext) {
  plan.actions.updateItemQuantities((previous) => ({
    ...previous,
    ...Object.fromEntries(resources.map(({ uid }) => [uid, 0])),
  }));
  plan.actions.updateItemPurchaseDays((previous) => ({
    ...previous,
    ...Object.fromEntries(resources.map(({ uid }) => [uid, 0])),
  }));
}
