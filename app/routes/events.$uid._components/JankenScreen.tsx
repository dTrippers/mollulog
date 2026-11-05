import { FlagIcon, StarIcon } from "@heroicons/react/16/solid";
import { useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { ShopSection } from "~/components/v2/features/events/ShopSection";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { PageActionBar, PageAside, PageMain, PanelSheet, useV2Page } from "~/components/v2/layout";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { useSignIn } from "~/contexts/SignInProvider";
import type { JankenConfig } from "~/domain/event-shop";
import {
  evaluateJankenPlan,
  getJankenScoreRewardWindow,
  getJankenResourceRoles,
  getJankenStudentGrowthRequired,
  type JankenPlanStep,
  type JankenResourceRoles,
} from "~/domain/event-shop/janken";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { jankenLocale as t } from "~/locales/ko";
import type { loader } from "../events.$uid.shop.janken";

type LoaderData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;
const emptyResourceRoles: JankenResourceRoles = { entryUid: null, shopUid: null, studentUid: null, equipmentUid: null };
const resourceLabel = (uid: string, roles: JankenResourceRoles) =>
  uid === roles.entryUid
    ? t.entryCurrency
    : uid === roles.shopUid
      ? t.shopCurrency
      : uid === roles.equipmentUid
        ? t.equipmentCurrency
        : uid === roles.studentUid
          ? t.studentGrowth
          : t.otherReward;

const stageLabel = (config: Extract<JankenConfig, { status: "available" }>, stageUid: string) => {
  const stage = config.stages.find(({ uid }) => uid === stageUid);
  if (!stage) return null;
  return stage.stageType === "story"
    ? t.storyStage(stage.stageNumber)
    : stage.stageType === "normal"
      ? t.normalStage(stage.stageNumber)
      : t.challengeStage;
};

function stageClearChain(config: Extract<JankenConfig, { status: "available" }>, stageUid: string): string[] {
  const byUid = new Map(config.stages.map((stage) => [stage.uid, stage]));
  const chain: string[] = [];
  let stage = byUid.get(stageUid);
  while (stage && !chain.includes(stage.uid)) {
    chain.push(stage.uid);
    stage = stage.previousStageUid ? byUid.get(stage.previousStageUid) : undefined;
  }
  return chain;
}

function summarizeStepResult(
  config: Extract<JankenConfig, { status: "available" }>,
  step: JankenPlanStep,
  cleared: Set<string>,
  currentScore: number,
  averageScore: number | null,
  roles: JankenResourceRoles,
  equipmentGoal: { have: number; need: number; tier: number } | null,
): { summary: string; nextScore: number; equipmentReward: number } {
  const evaluated = evaluateJankenPlan(config, {
    stagePlays: { [step.stageUid]: step.plays },
    clearedStageUids: [...cleared],
    currentScore,
    averageScore,
  });
  const nextScore = evaluated.projectedScore;
  const rewards = [
    ...new Set([roles.studentUid, roles.shopUid, roles.equipmentUid].filter((uid): uid is string => Boolean(uid))),
  ]
    .map((uid) => ({ uid, quantity: evaluated.rewards[uid] ?? 0 }))
    .filter(({ quantity }) => quantity > 0)
    .slice(0, 2)
    .map(({ uid, quantity }) => t.expectedResourceResult(resourceLabel(uid, roles), quantity));
  if (step.kind === "equipment" && equipmentGoal && roles.equipmentUid) {
    rewards.push(
      t.equipmentStepResult(
        equipmentGoal.have + (evaluated.rewards[roles.equipmentUid] ?? 0),
        equipmentGoal.need,
        equipmentGoal.tier,
      ),
    );
  }
  const score = step.kind === "score" && nextScore > currentScore ? [t.scoreResult(nextScore - currentScore)] : [];
  return {
    summary: [...score, ...rewards].join(" · ") || t.firstClearResult,
    nextScore,
    equipmentReward: roles.equipmentUid ? (evaluated.rewards[roles.equipmentUid] ?? 0) : 0,
  };
}

function scorePresets(config: Extract<JankenConfig, { status: "available" }>, studentUid: string | null) {
  const rows = config.scoreRewards;
  const candidates: { score: number; tier: number }[] = [];
  let studentRewardScore: number | null = null;
  if (studentUid) {
    const lastEleph = [...rows]
      .reverse()
      .find(({ rewards }) => rewards.some((reward) => reward.resourceUid === studentUid));
    if (lastEleph) {
      candidates.push({ score: lastEleph.score, tier: lastEleph.tier });
      studentRewardScore = lastEleph.score;
    }
  }
  if (rows.length > 1) {
    const signature = (row: (typeof rows)[number]) =>
      JSON.stringify(row.rewards.map(({ resourceUid, quantity }) => [resourceUid, quantity]).sort());
    for (let index = 1; index < rows.length - 1; index += 1) {
      if (
        signature(rows[index]) === signature(rows[index + 1]) &&
        rows.slice(index + 1).every((row) => signature(row) === signature(rows[index]))
      ) {
        candidates.push({ score: rows[index - 1].score, tier: rows[index - 1].tier });
        break;
      }
    }
  }
  const last = rows.at(-1);
  if (last) candidates.push({ score: last.score, tier: last.tier });
  return [...new Map(candidates.map((item) => [item.score, item])).values()].map((item) => ({
    ...item,
    rewardUid: item.score === studentRewardScore ? studentUid : null,
  }));
}

export default function JankenScreen({ loaderData }: { loaderData: LoaderData }) {
  const planContext = useOutletContext<EventShopPlanContext>();
  const { showSignIn } = useSignIn();
  const { stacked } = useV2Page();
  const persistence = planContext.jankenPersistence;
  const config =
    planContext.minigameConfig?.minigameType === "janken"
      ? (planContext.minigameConfig.janken ?? { status: "unavailable" as const })
      : { status: "unavailable" as const };
  const entry = planContext.jankenEntry;
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const tab = selectedTab ?? (stacked ? "score" : "eff");
  const [showAllScoreRewards, setShowAllScoreRewards] = useState(false);
  const goals = entry.goals;
  const progress = entry.progress;
  const available = config.status === "available";
  const studentUid = available ? (planContext.jankenStudentGrowthUid ?? null) : null;
  const resourceRoles = useMemo(
    () =>
      available
        ? getJankenResourceRoles(
            config,
            planContext.shopResources.map(({ paymentResource }) => paymentResource.uid),
            studentUid,
          )
        : emptyResourceRoles,
    [available, config, planContext.shopResources, studentUid],
  );
  const shopUid = resourceRoles.shopUid;
  const linkedShopCurrencyRequired = planContext.jankenShopCurrency.required;
  const linkedShopCurrencyOwned = planContext.jankenShopCurrency.owned;
  const growthNeeded = available
    ? (getJankenStudentGrowthRequired(progress.currentTier, goals.targetTier, progress.heldEleph) ?? 0)
    : 0;
  const planned = planContext.jankenPlan;

  const updateProgress = (patch: Partial<JankenPlannerEntry["progress"]>) => {
    const next = { ...entryRef.current, progress: { ...entryRef.current.progress, ...patch } };
    entryRef.current = next;
    planContext.setJankenEntry(next);
  };
  const updateGoals = (patch: Partial<JankenPlannerEntry["goals"]>) => {
    const next = { ...entryRef.current, goals: { ...entryRef.current.goals, ...patch } };
    entryRef.current = next;
    planContext.setJankenEntry(next);
  };
  const apPending = planned.status === "available" && planContext.isCalculating;
  const ap = planned.status === "available" && !apPending ? planContext.stageCalculations.totalApWithExtras : null;
  const targetEquipmentTier = goals.targetEquipmentTier;
  const shopCurrencyGoal = goals.shopCurrencyMode === "linked" || goals.manualShopCurrency > 0;
  const hasExplicitGoals =
    goals.targetTier != null ||
    goals.targetScore != null ||
    goals.targetEquipmentTier != null ||
    goals.shopCurrencyMode === "manual";
  const missingAverageScore = planned.status === "score-input-required";
  const equipmentRequired =
    config.status === "available" && targetEquipmentTier != null
      ? config.equipmentUpgrade.tierCosts
          .filter(({ tier }) => tier > progress.equipmentTier && tier <= targetEquipmentTier)
          .reduce((sum, item) => sum + item.quantity, 0)
      : 0;
  const visibleScoreRewards = showAllScoreRewards
    ? config.status === "available"
      ? config.scoreRewards
      : []
    : config.status === "available"
      ? getJankenScoreRewardWindow(config.scoreRewards, progress.cumulativeScore, goals.targetScore)
      : [];
  const recommendationRows = useMemo(() => {
    if (!available || config.status !== "available" || !planned) return [];
    const cleared = new Set(progress.clearedStageUids);
    let currentScore = progress.cumulativeScore;
    let equipmentHave = progress.heldEquipmentCurrency;
    return planned.planSteps.map((step) => {
      const name = stageLabel(config, step.stageUid) ?? t.challengeStage;
      const result = summarizeStepResult(
        config,
        step,
        cleared,
        currentScore,
        goals.averageScore,
        resourceRoles,
        goals.targetEquipmentTier == null
          ? null
          : { have: equipmentHave, need: equipmentRequired, tier: goals.targetEquipmentTier },
      );
      currentScore = result.nextScore;
      equipmentHave += result.equipmentReward;
      for (const uid of stageClearChain(config, step.stageUid)) cleared.add(uid);
      return { ...step, name, result: result.summary };
    });
  }, [
    available,
    config,
    planned,
    progress.clearedStageUids,
    progress.cumulativeScore,
    goals.averageScore,
    resourceRoles,
    progress.heldEquipmentCurrency,
    goals.targetEquipmentTier,
    equipmentRequired,
  ]);

  return (
    <>
      <PageMain>
        <div className={`space-y-v2-section-gap ${stacked ? "pb-24" : ""}`}>
          <p className="text-sm text-v2-fg-secondary">{t.lead}</p>
          {!available ? (
            <StatusNotice tone={config.status === "invalid" ? "danger" : "neutral"}>
              {config.status === "invalid" ? t.invalid : t.unavailable}
            </StatusNotice>
          ) : null}
          {available && !shopUid ? <StatusNotice tone="danger">{t.invalid}</StatusNotice> : null}
          {persistence.isConflict ? (
            <StatusNotice
              tone="danger"
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={persistence.reloadLatest}
                  >
                    {t.reload}
                  </Button>
                  <Button size="sm" onClick={persistence.overwrite}>
                    {t.overwrite}
                  </Button>
                </div>
              }
            >
              {persistence.conflictError ?? t.conflict}
            </StatusNotice>
          ) : null}
          {available ? (
            <>
              {!hasExplicitGoals ? <StatusNotice tone="neutral">{t.firstVisitNotice}</StatusNotice> : null}
              <ShopSection title={t.goals} persistenceKey="event-shop-section::janken-goals" variant="shop">
                <div className="divide-y divide-v2-divider rounded-lg bg-v2-surface">
                  {studentUid ? (
                    <article className="p-v2-block-p">
                      <header className="flex items-center justify-between gap-3">
                        <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                          <span aria-hidden="true">
                            <ResourceThumb itemUid={studentUid} name="" size="sm" />
                          </span>
                          <span>{t.studentGrowth}</span>
                        </h3>
                        {goals.targetTier != null ? (
                          <span className="whitespace-nowrap text-xs font-medium text-v2-fg-secondary">
                            <strong>{t.remainingCount(growthNeeded)}</strong>
                            <span className="ml-1 text-v2-fg-tertiary">{t.remainingCountSuffix}</span>
                          </span>
                        ) : null}
                      </header>
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                          <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.current}</span>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <fieldset
                              aria-label={t.currentTier}
                              className="m-0 flex flex-wrap gap-1 border-0 p-0 md:flex-nowrap"
                            >
                              {Array.from({ length: 9 }, (_, index) => index + 1).map((tier) => (
                                <ToggleChip
                                  key={tier}
                                  pressed={progress.currentTier === tier}
                                  ariaLabel={`${t.currentTier} ${t.tierLabel(tier)}`}
                                  onPressedChange={() => updateProgress({ currentTier: tier })}
                                >
                                  <span className="flex items-center gap-1">
                                    {tier <= 5 ? (
                                      <StarIcon className="size-3.5 text-v2-warning" aria-hidden="true" />
                                    ) : (
                                      <img
                                        src="/icons/exclusive_weapon.png"
                                        alt=""
                                        className="size-3.5 object-contain"
                                      />
                                    )}
                                    {tier <= 5 ? tier : tier - 5}
                                  </span>
                                </ToggleChip>
                              ))}
                            </fieldset>
                            <label
                              htmlFor="janken-held-student"
                              className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-v2-fg-secondary"
                            >
                              {t.owned}
                              <NumberInput
                                id="janken-held-student"
                                aria-label={`${t.studentGrowth} · ${t.heldCount}`}
                                className="w-28"
                                grouped
                                min={0}
                                value={progress.heldEleph}
                                onValueChange={(value) => updateProgress({ heldEleph: Math.max(0, Math.trunc(value)) })}
                              />
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                          <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.goal}</span>
                          <fieldset
                            aria-label={t.targetTier}
                            className="m-0 flex flex-wrap gap-1 border-0 p-0 md:flex-nowrap"
                          >
                            <ToggleChip
                              pressed={goals.targetTier === null}
                              ariaLabel={t.noGoal}
                              onPressedChange={() => updateGoals({ targetTier: null })}
                            >
                              {t.noGoal}
                            </ToggleChip>
                            {[3, 4, 6, 7, 8, 9].map((tier) => (
                              <ToggleChip
                                key={tier}
                                disabled={tier <= progress.currentTier && goals.targetTier !== tier}
                                pressed={goals.targetTier === tier}
                                ariaLabel={`${t.targetTier} ${t.tierLabel(tier)}`}
                                onPressedChange={() =>
                                  updateGoals({ targetTier: goals.targetTier === tier ? null : tier })
                                }
                              >
                                <span className="flex items-center gap-1">
                                  {tier <= 5 ? (
                                    <StarIcon className="size-3.5 text-v2-warning" aria-hidden="true" />
                                  ) : (
                                    <img src="/icons/exclusive_weapon.png" alt="" className="size-3.5 object-contain" />
                                  )}
                                  {tier <= 5 ? tier : tier - 5}
                                </span>
                              </ToggleChip>
                            ))}
                          </fieldset>
                        </div>
                        {!persistence.hasSavedEntry ? (
                          <p className="ml-[3.25rem] text-xs text-v2-fg-tertiary sm:ml-16">
                            {planContext.recruitedStudentUids.includes(studentUid) ? (
                              <>
                                <Link className="text-v2-link" to={`/students/${studentUid}`}>
                                  {t.recruitedSourceLabel}
                                </Link>
                                {t.recruitedSourceSuffix}
                              </>
                            ) : (
                              t.initialTierNotice
                            )}
                            {planContext.signedIn ? (
                              <>
                                {" · "}
                                <Link className="text-v2-link" to="/utils/resources/inventory">
                                  {t.inventoryPlanner}
                                </Link>
                                {t.inventorySourceSuffix(loaderData.inventoryDate)}
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ) : (
                    <article className="p-v2-block-p">
                      <h3 className="font-semibold">{t.studentGrowth}</h3>
                      <StatusNotice tone="neutral">{t.studentGrowthUnavailable}</StatusNotice>
                    </article>
                  )}

                  {shopUid ? (
                    <article className="p-v2-block-p">
                      <header className="flex items-center justify-between gap-3">
                        <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                          <span aria-hidden="true">
                            <ResourceThumb itemUid={shopUid} name="" size="sm" />
                          </span>
                          <span>{t.shopCurrency}</span>
                        </h3>
                        {shopCurrencyGoal ? (
                          <span className="whitespace-nowrap text-xs font-medium text-v2-fg-secondary">
                            <strong>
                              {t.remainingCount(
                                goals.shopCurrencyMode === "linked"
                                  ? linkedShopCurrencyRequired
                                  : goals.manualShopCurrency,
                              )}
                            </strong>
                            <span className="ml-1 text-v2-fg-tertiary">{t.remainingCountSuffix}</span>
                          </span>
                        ) : null}
                      </header>
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                          <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.current}</span>
                          <span className="inline-flex items-center gap-2 text-sm tabular-nums">
                            <span className="text-xs text-v2-fg-tertiary">{t.owned}</span>
                            <strong>{linkedShopCurrencyOwned.toLocaleString()}</strong>
                          </span>
                        </div>
                        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                          <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.goal}</span>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-1">
                              <ToggleChip
                                pressed={goals.shopCurrencyMode === "linked"}
                                ariaLabel={t.shopLinked}
                                onPressedChange={() => updateGoals({ shopCurrencyMode: "linked" })}
                              >
                                {t.shopLinked}
                              </ToggleChip>
                              <ToggleChip
                                pressed={goals.shopCurrencyMode === "manual"}
                                ariaLabel={t.shopManual}
                                onPressedChange={() => updateGoals({ shopCurrencyMode: "manual" })}
                              >
                                {t.shopManual}
                              </ToggleChip>
                            </div>
                            {goals.shopCurrencyMode === "linked" ? (
                              <span className="text-sm font-medium tabular-nums">
                                {linkedShopCurrencyRequired.toLocaleString()}
                              </span>
                            ) : (
                              <NumberInput
                                id="janken-manual-shop-currency"
                                aria-label={t.manualShopCurrency}
                                className="w-28"
                                grouped
                                min={0}
                                value={goals.manualShopCurrency}
                                onValueChange={(value) =>
                                  updateGoals({ manualShopCurrency: Math.max(0, Math.trunc(value)) })
                                }
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  ) : null}

                  <article className="p-v2-block-p">
                    <header className="flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <FlagIcon className="size-4 text-v2-fg-tertiary" aria-hidden="true" />
                        <span>{t.scoreGoal}</span>
                      </h3>
                      {missingAverageScore ? (
                        <span role="status" className="whitespace-nowrap text-xs font-medium text-v2-warning">
                          {t.scoreAverageNeeded}
                        </span>
                      ) : goals.targetScore != null ? (
                        <span className="whitespace-nowrap text-sm text-v2-fg-secondary">
                          <strong>
                            {Math.floor(
                              Math.max(0, goals.targetScore - progress.cumulativeScore) / 10_000,
                            ).toLocaleString()}
                          </strong>
                          <span className="text-xs text-v2-fg-tertiary">만 점 {t.remainingCountSuffix}</span>
                        </span>
                      ) : null}
                    </header>
                    <p className="mt-1 text-xs text-v2-fg-tertiary">{t.scoreGoalHelp}</p>
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                        <label htmlFor="janken-current-score" className="pt-1 text-xs font-medium text-v2-fg-secondary">
                          {t.current}
                        </label>
                        <NumberInput
                          id="janken-current-score"
                          aria-label={`${t.current} ${t.scoreGoal}`}
                          className="w-full max-w-40"
                          grouped
                          formatThousands
                          min={0}
                          value={progress.cumulativeScore}
                          onValueChange={(value) => updateProgress({ cumulativeScore: Math.max(0, Math.trunc(value)) })}
                        />
                      </div>
                      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                        <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.goal}</span>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <fieldset aria-label={t.targetScore} className="m-0 flex flex-wrap gap-1 border-0 p-0">
                            <ToggleChip
                              pressed={goals.targetScore === null}
                              ariaLabel={t.noGoal}
                              onPressedChange={() => updateGoals({ targetScore: null })}
                            >
                              {t.noGoal}
                            </ToggleChip>
                            {scorePresets(config, studentUid).map(({ score, tier, rewardUid }) => (
                              <ToggleChip
                                key={score}
                                pressed={goals.targetScore === score}
                                ariaLabel={t.scorePreset(score, tier)}
                                onPressedChange={() =>
                                  updateGoals({ targetScore: goals.targetScore === score ? null : score })
                                }
                              >
                                <span className="inline-flex items-center gap-1">
                                  {rewardUid ? (
                                    <span aria-hidden="true">
                                      <ResourceThumb itemUid={rewardUid} name="" size="sm" />
                                    </span>
                                  ) : null}
                                  {t.scorePreset(score, tier)}
                                </span>
                              </ToggleChip>
                            ))}
                          </fieldset>
                          {goals.targetScore != null ? (
                            <NumberInput
                              id="janken-target-score"
                              aria-label={t.targetScore}
                              className="w-full max-w-40"
                              grouped
                              formatThousands
                              min={0}
                              value={goals.targetScore}
                              onValueChange={(value) =>
                                updateGoals({ targetScore: Math.max(0, Math.trunc(value)) || null })
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                      {goals.targetScore != null ? (
                        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                          <label
                            htmlFor="janken-average-score"
                            className="pt-1 text-xs font-medium text-v2-fg-secondary"
                          >
                            {t.averageScoreShort}
                          </label>
                          <div
                            className={`w-full max-w-40 rounded-md p-1 ${missingAverageScore ? "bg-v2-warning-subtle" : ""}`}
                          >
                            <NumberInput
                              id="janken-average-score"
                              aria-label={t.averageScore}
                              className="w-full"
                              grouped
                              formatThousands
                              min={0}
                              value={goals.averageScore ?? ""}
                              onValueChange={(value) =>
                                updateGoals({ averageScore: Math.max(0, Math.trunc(value)) || null })
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>

                  <article className="p-v2-block-p">
                    <header className="flex items-center justify-between gap-3">
                      <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                        {config.equipmentUpgrade.costResource ? (
                          <span aria-hidden="true">
                            <ResourceThumb
                              itemUid={config.equipmentUpgrade.costResource.resourceUid}
                              name=""
                              size="sm"
                            />
                          </span>
                        ) : null}
                        <span>{t.equipmentGoal}</span>
                      </h3>
                      {goals.targetEquipmentTier != null ? (
                        <span className="whitespace-nowrap text-xs font-medium text-v2-fg-secondary">
                          <strong>
                            {t.remainingCount(Math.max(0, equipmentRequired - progress.heldEquipmentCurrency))}
                          </strong>
                          <span className="ml-1 text-v2-fg-tertiary">{t.remainingCountSuffix}</span>
                        </span>
                      ) : null}
                    </header>
                    <p className="mt-1 text-xs text-v2-fg-tertiary">{t.equipmentGoalHint(config.equipments.length)}</p>
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                        <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.current}</span>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <fieldset
                            aria-label={t.currentEquipmentTier}
                            className="m-0 flex flex-wrap gap-1 border-0 p-0 md:flex-nowrap"
                          >
                            {Array.from({ length: config.equipmentUpgrade.maxTier }, (_, index) => index + 1).map(
                              (tier) => (
                                <ToggleChip
                                  key={tier}
                                  pressed={progress.equipmentTier === tier}
                                  ariaLabel={t.equipmentGoalTier(tier)}
                                  onPressedChange={() => updateProgress({ equipmentTier: tier })}
                                >
                                  T{tier}
                                </ToggleChip>
                              ),
                            )}
                          </fieldset>
                          <label
                            htmlFor="janken-held-equipment-currency"
                            className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-v2-fg-secondary"
                          >
                            {t.heldEquipmentCurrency}
                            <NumberInput
                              id="janken-held-equipment-currency"
                              aria-label={t.heldEquipmentCurrency}
                              className="w-28"
                              grouped
                              min={0}
                              value={progress.heldEquipmentCurrency}
                              onValueChange={(value) =>
                                updateProgress({ heldEquipmentCurrency: Math.max(0, Math.trunc(value)) })
                              }
                            />
                          </label>
                        </div>
                      </div>
                      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                        <span className="pt-1 text-xs font-medium text-v2-fg-secondary">{t.goal}</span>
                        <fieldset
                          aria-label={t.equipmentGoal}
                          className="m-0 flex flex-wrap gap-1 border-0 p-0 md:flex-nowrap"
                        >
                          <ToggleChip
                            pressed={goals.targetEquipmentTier === null}
                            ariaLabel={t.noGoal}
                            onPressedChange={() => updateGoals({ targetEquipmentTier: null })}
                          >
                            {t.noGoal}
                          </ToggleChip>
                          {Array.from({ length: config.equipmentUpgrade.maxTier }, (_, index) => index + 1).map(
                            (tier) => (
                              <ToggleChip
                                key={tier}
                                disabled={tier <= progress.equipmentTier && goals.targetEquipmentTier !== tier}
                                pressed={goals.targetEquipmentTier === tier}
                                ariaLabel={t.equipmentGoalTier(tier)}
                                onPressedChange={() =>
                                  updateGoals({ targetEquipmentTier: goals.targetEquipmentTier === tier ? null : tier })
                                }
                              >
                                T{tier}
                              </ToggleChip>
                            ),
                          )}
                        </fieldset>
                      </div>
                    </div>
                  </article>

                  <article className="p-v2-block-p">
                    <header className="font-semibold">{t.clearedStages}</header>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {config.stages.map((stage) => {
                        const label = stageLabel(config, stage.uid) ?? t.challengeStage;
                        const cleared = progress.clearedStageUids.includes(stage.uid);
                        return (
                          <ToggleChip
                            key={stage.uid}
                            pressed={cleared}
                            className={
                              cleared ? "bg-v2-success-subtle text-v2-success hover:bg-v2-success-subtle" : undefined
                            }
                            ariaLabel={t.stageCleared(label)}
                            onPressedChange={() =>
                              updateProgress({
                                clearedStageUids: cleared
                                  ? progress.clearedStageUids.filter((uid) => uid !== stage.uid)
                                  : [...progress.clearedStageUids, stage.uid],
                              })
                            }
                          >
                            {cleared ? (
                              <span className="mr-1" aria-hidden="true">
                                ✓
                              </span>
                            ) : null}
                            {label}
                          </ToggleChip>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-v2-fg-tertiary">{t.clearedStagesHelp}</p>
                  </article>
                </div>
              </ShopSection>
              <ShopSection title={t.steps} persistenceKey="event-shop-section::janken-steps" variant="shop">
                {planned?.status === "score-input-required" ? (
                  <StatusNotice tone="neutral">{t.scoreAverageRequired}</StatusNotice>
                ) : planned?.status === "invalid" ? (
                  <StatusNotice tone="danger">{t.invalid}</StatusNotice>
                ) : planned?.status === "available" ? (
                  <ol className="divide-y divide-v2-divider rounded-lg bg-v2-surface">
                    <li className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 p-3">
                      <span
                        className="grid size-6 place-items-center rounded-full bg-v2-success-subtle text-sm text-v2-success"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <div>
                        <p className="font-semibold">{t.clearedStagesSummary(progress.clearedStageUids.length)}</p>
                        <p className="text-xs text-v2-fg-tertiary">
                          {progress.clearedStageUids
                            .map((uid) => stageLabel(config, uid))
                            .filter(Boolean)
                            .join(" · ") || t.noClearedStages}
                        </p>
                      </div>
                      <span className="text-sm text-v2-fg-tertiary">—</span>
                    </li>
                    {recommendationRows.map((step, index) => {
                      const stage = config.stages.find(({ uid }) => uid === step.stageUid);
                      if (!stage) return null;
                      const title =
                        step.kind === "prerequisite"
                          ? t.prerequisiteStep
                          : step.kind === "equipment"
                            ? t.equipmentStep
                            : step.kind === "score"
                              ? t.scoreStep
                              : t.remainingStep;
                      const multiplierRecommended =
                        stage.stageType === "normal" && (step.kind === "equipment" || step.kind === "remaining");
                      return (
                        <li
                          key={`${step.kind}:${step.stageUid}`}
                          className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 p-3"
                        >
                          <span className="grid size-6 place-items-center rounded-full bg-v2-inset text-xs">
                            {index + 2}
                          </span>
                          <div>
                            <p className="font-semibold">
                              {title}
                              <span className="ml-2 whitespace-nowrap rounded bg-v2-inset px-2 text-xs">
                                {step.name} {t.playCountBadge(step.plays)}
                              </span>
                              {multiplierRecommended ? (
                                <span className="ml-2 rounded bg-v2-accent-subtle px-2 py-0.5 text-xs font-medium text-v2-accent">
                                  {t.multiplierAdvice}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-v2-fg-tertiary">{step.result}</p>
                            {multiplierRecommended ? (
                              <p className="mt-1 text-xs text-v2-fg-tertiary">
                                {t.multiplierSplit(step.plays, config.multipleMax)}
                              </p>
                            ) : null}
                          </div>
                          <span className="flex items-center gap-1 text-sm tabular-nums">
                            <ResourceThumb itemUid={stage.entryCost.resourceUid} name={t.entryCurrency} size="sm" />
                            {(stage.entryCost.quantity * step.plays).toLocaleString()}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </ShopSection>
              <ShopSection title={t.references} persistenceKey="event-shop-section::janken-references" variant="shop">
                <SectionTabs
                  label={t.references}
                  selectedId={tab}
                  onChange={setSelectedTab}
                  items={[
                    { id: "eff", label: t.efficiencyTab },
                    { id: "score", label: t.scoreRewardsTab },
                    { id: "equipment", label: t.equipmentTab },
                  ]}
                />
                {tab === "eff" ? (
                  <div className="overflow-x-auto rounded-lg bg-v2-surface">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead className="text-xs text-v2-fg-tertiary">
                        <tr>
                          <th className="p-2 text-left">{t.stageColumn}</th>
                          <th className="p-2 text-right">{t.entryCurrency}</th>
                          {[
                            [shopUid, t.shopCurrency],
                            [studentUid, t.studentGrowth],
                            [config.equipmentUpgrade.costResource?.resourceUid ?? null, t.equipmentCurrency],
                          ].map(([uid, label]) => (
                            <th key={label as string} className="p-2 text-right">
                              <span className="inline-flex items-center justify-end gap-1">
                                {uid ? (
                                  <ResourceThumb itemUid={uid as string} name={label as string} size="sm" />
                                ) : null}
                                {label as string}
                              </span>
                            </th>
                          ))}
                          <th className="p-2 text-right">{t.firstClearColumn}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {config.stages
                          .filter(({ stageType }) => stageType === "normal" || stageType === "challenge")
                          .map((stage) => (
                            <tr key={stage.uid} className="border-t border-v2-divider">
                              <th className="p-2 text-left font-medium">{stageLabel(config, stage.uid)}</th>
                              <td className="p-2 text-right tabular-nums">{stage.entryCost.quantity}</td>
                              {[
                                [shopUid, t.shopCurrency],
                                [studentUid, t.studentGrowth],
                                [config.equipmentUpgrade.costResource?.resourceUid ?? null, t.equipmentCurrency],
                              ].map(([uid, label], index) => {
                                const amount = uid
                                  ? stage.rewards
                                      .filter((reward) => reward.tag === "default" && reward.resourceUid === uid)
                                      .reduce((sum, reward) => sum + reward.quantity * reward.probability, 0)
                                  : 0;
                                const value =
                                  stage.entryCost.quantity > 0 ? (amount * 1000) / stage.entryCost.quantity : 0;
                                const maxValue = Math.max(
                                  ...config.stages
                                    .filter(({ stageType }) => stageType === "normal" || stageType === "challenge")
                                    .map((candidate) => {
                                      const yieldValue = uid
                                        ? candidate.rewards
                                            .filter((reward) => reward.tag === "default" && reward.resourceUid === uid)
                                            .reduce((sum, reward) => sum + reward.quantity * reward.probability, 0)
                                        : 0;
                                      return candidate.entryCost.quantity > 0
                                        ? (yieldValue * 1000) / candidate.entryCost.quantity
                                        : 0;
                                    }),
                                );
                                return (
                                  <td
                                    key={label as string}
                                    className={`p-2 text-right tabular-nums ${value > 0 && value === maxValue ? "font-bold text-v2-link" : "text-v2-fg-secondary"}`}
                                  >
                                    {index === 2 && amount === 0 ? "—" : value.toFixed(index === 2 ? 0 : 2)}
                                  </td>
                                );
                              })}
                              <td className="p-2 text-right">
                                {stage.rewards
                                  .filter(({ tag }) => tag === "first_clear")
                                  .map((reward) => (
                                    <span key={reward.resourceUid} className="ml-2 inline-flex items-center gap-1">
                                      <ResourceThumb
                                        itemUid={reward.resourceUid}
                                        resourceType={reward.resourceType}
                                        name={resourceLabel(reward.resourceUid, resourceRoles)}
                                        size="sm"
                                      />
                                      {resourceLabel(reward.resourceUid, resourceRoles)} {reward.quantity}
                                    </span>
                                  ))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    <p className="p-2 text-xs text-v2-fg-tertiary">{t.efficiencyHelp}</p>
                  </div>
                ) : null}
                {tab === "score" ? (
                  <>
                    <div className="divide-y divide-v2-divider rounded-lg bg-v2-surface">
                      {visibleScoreRewards.map((reward) => (
                        <div
                          key={reward.tier}
                          className={`flex items-center justify-between px-3 py-2 text-sm ${reward.score <= progress.cumulativeScore ? "text-v2-fg-tertiary" : goals.targetScore === reward.score ? "bg-v2-link-subtle" : ""}`}
                        >
                          <span>
                            {t.scoreTierLabel(reward.tier, reward.score)}
                            {goals.targetScore === reward.score ? (
                              <span className="ml-2 text-xs text-v2-link">{t.targetTag}</span>
                            ) : null}
                          </span>
                          <span className="flex gap-1">
                            {reward.rewards.map((item) => (
                              <span key={item.resourceUid} className="flex items-center gap-1">
                                <ResourceThumb
                                  itemUid={item.resourceUid}
                                  resourceType={item.resourceType}
                                  name={resourceLabel(item.resourceUid, resourceRoles)}
                                  size="sm"
                                />
                                {item.quantity.toLocaleString()}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                    {config.scoreRewards.length > 10 ? (
                      <Button
                        variant="text"
                        className="mt-2 w-full"
                        onClick={() => setShowAllScoreRewards((shown) => !shown)}
                      >
                        {showAllScoreRewards ? t.collapse : t.showAll}
                      </Button>
                    ) : null}
                    <p className="mt-2 text-xs text-v2-fg-tertiary">{t.scoreClaimedHelp}</p>
                  </>
                ) : null}
                {tab === "equipment" ? (
                  <div className="divide-y divide-v2-divider rounded-lg bg-v2-surface">
                    {config.equipmentUpgrade.tierCosts.map(({ tier, quantity }) => (
                      <div key={tier} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          {config.equipmentUpgrade.costResource ? (
                            <ResourceThumb
                              itemUid={config.equipmentUpgrade.costResource.resourceUid}
                              name={t.equipmentCurrency}
                              size="sm"
                            />
                          ) : null}
                          {t.equipmentCostRow(
                            tier,
                            quantity,
                            config.equipmentUpgrade.tierCosts
                              .filter((cost) => cost.tier <= tier)
                              .reduce((sum, cost) => sum + cost.quantity, 0),
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </ShopSection>
            </>
          ) : null}
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet panelId="janken-summary" title={t.summary} Icon={FlagIcon} defaultExpanded>
          <p className="text-xs text-v2-fg-tertiary">{t.entryCurrencyRequired}</p>
          <p className="flex items-center gap-2 text-2xl font-bold tabular-nums">
            {planned.entryResourceUid ? (
              <ResourceThumb itemUid={planned.entryResourceUid} name={t.entryCurrency} size="sm" />
            ) : null}
            {planned.status === "available" ? planned.entryCost.toLocaleString() : "—"}
          </p>
          <p className="mt-3 text-xs text-v2-fg-tertiary">{t.requiredApTitle}</p>
          <p className="mt-1 text-lg font-semibold">
            {ap == null ? (apPending ? t.calculationPending : "—") : t.approximateAp(ap)}
          </p>
          <p className="mt-3 text-xs text-v2-fg-secondary">
            {missingAverageScore ? t.scoreAverageSummary : t.summarySync}
          </p>
          <Link
            className={`${v2ButtonClassName({ variant: "secondary" })} mt-3 w-full`}
            to={`/events/${loaderData.eventUid}/shop`}
          >
            {t.shopCalculatorLink}
          </Link>
          {persistence.isSaving ? (
            <p role="status" className="mt-3 text-xs text-v2-fg-tertiary">
              {t.saving}
            </p>
          ) : null}
          {persistence.saveError ? (
            <StatusNotice
              className="mt-3"
              tone="danger"
              action={
                <Button
                  size="sm"
                  onClick={persistence.retrySave}
                >
                  {t.retrySave}
                </Button>
              }
            >
              {t.saveFailed}
            </StatusNotice>
          ) : null}
          {!planContext.signedIn ? (
            <p className="mt-3 text-xs text-v2-fg-tertiary">
              {t.guestLoginHelp}{" "}
              <Button variant="link" size="sm" className="inline-flex" onClick={showSignIn}>
                {t.login}
              </Button>
            </p>
          ) : null}
        </PanelSheet>
      </PageAside>
      {stacked ? (
        <PageActionBar
          placement="fixed"
          className="janken-mobile-action-bar"
          summary={
            <div className="space-y-1">
              <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                {planned.entryResourceUid ? (
                  <ResourceThumb itemUid={planned.entryResourceUid} name={t.entryCurrency} size="sm" />
                ) : null}
                {planned.status === "available" ? planned.entryCost.toLocaleString() : "—"} ·{" "}
                {ap == null ? (apPending ? t.calculationPending : "—") : t.approximateAp(ap)}
              </span>
              <span className="block text-xs font-normal text-v2-fg-tertiary">
                {persistence.saveError
                  ? t.saveFailed
                  : persistence.isSaving
                    ? t.saving
                    : missingAverageScore
                      ? t.scoreAverageSummary
                      : t.mobileSync}
              </span>
            </div>
          }
        >
          {persistence.saveError ? (
            <Button
              variant="secondary"
              onClick={persistence.retrySave}
            >
              {t.retrySave}
            </Button>
          ) : (
            <Link className={v2ButtonClassName({ variant: "secondary" })} to={`/events/${loaderData.eventUid}/shop`}>
              {t.mobileShopCalculatorLink}
            </Link>
          )}
        </PageActionBar>
      ) : null}
    </>
  );
}
