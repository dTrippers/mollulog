import { ExclamationCircleIcon, FlagIcon, StarIcon } from "@heroicons/react/16/solid";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useOutletContext } from "react-router";
import { ShopSection } from "~/components/v2/features/events/ShopSection";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { AsideLinks, PageActionBar, PageAside, PageMain, PanelSheet, useV2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import type { JankenConfig } from "~/domain/event-shop";
import { calculateShopApRequirement } from "~/domain/event-shop/calculations/calculate-shop-ap";
import { calculateResourceLedger } from "~/domain/event-shop/calculations/ledger";
import {
  evaluateJankenPlan,
  getJankenResourceRoles,
  getJankenStudentGrowthRequired,
  type JankenPlanStep,
  type JankenResourceRoles,
  planJanken,
} from "~/domain/event-shop/janken";
import { calculateCumulativeTierEleph } from "~/domain/growth-resource";
import { type JankenPlannerEntry, normalizeJankenPlannerProgress } from "~/domain/planner-state";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { readGuestPlanner, updateGuestPlanner } from "~/lib/guest-planner.client";
import { jankenLocale as t } from "~/locales/ko";
import type { loader } from "../events.$uid.shop.janken";

type LoaderData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;
const emptyEntry: JankenPlannerEntry = {
  progress: {
    currentTier: 1,
    heldEleph: 0,
    cumulativeScore: 0,
    equipmentTier: 1,
    heldEquipmentCurrency: 0,
    clearedStageUids: [],
  },
  goals: {
    targetTier: null,
    shopCurrencyMode: "linked",
    manualShopCurrency: 0,
    targetScore: null,
    averageScore: null,
    targetEquipmentTier: null,
  },
};
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
  if (studentUid) {
    const lastEleph = [...rows]
      .reverse()
      .find(({ rewards }) => rewards.some((reward) => reward.resourceUid === studentUid));
    if (lastEleph) candidates.push({ score: lastEleph.score, tier: lastEleph.tier });
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
  return [...new Map(candidates.map((item) => [item.score, item])).values()];
}

export default function JankenScreen({ loaderData }: { loaderData: LoaderData }) {
  const planContext = useOutletContext<EventShopPlanContext>();
  const { stacked } = useV2Page();
  const fetcher = useFetcher<{
    success?: boolean;
    conflict?: boolean;
    error?: string;
    entry?: JankenPlannerEntry;
    latest?: JankenPlannerEntry | null;
  }>();
  const config = loaderData.config ?? { status: "unavailable" as const };
  const defaultEntry: JankenPlannerEntry = {
    ...emptyEntry,
    progress: {
      ...emptyEntry.progress,
      currentTier: loaderData.defaultProgress.currentTier,
      heldEleph: loaderData.defaultProgress.heldEleph,
    },
  };
  const [entry, setEntry] = useState<JankenPlannerEntry>(loaderData.entry ?? defaultEntry);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [hasEdited, setHasEdited] = useState(false);
  const [hasSavedEntry, setHasSavedEntry] = useState(loaderData.entry !== null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [latestConflict, setLatestConflict] = useState<JankenPlannerEntry | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const tab = selectedTab ?? (stacked ? "score" : "eff");
  const [showAllScoreRewards, setShowAllScoreRewards] = useState(false);
  const baseRef = useRef<JankenPlannerEntry | null>(loaderData.entry);
  const submittedEntryRef = useRef<JankenPlannerEntry | null>(null);
  const handledResponseRef = useRef<unknown>(null);
  const entriesEqual = useCallback(
    (left: JankenPlannerEntry | null, right: JankenPlannerEntry | null) => {
      const canonicalEntry = (candidate: JankenPlannerEntry | null) =>
        candidate
          ? (normalizeJankenPlannerProgress({ [loaderData.shopStateUid]: candidate })?.[loaderData.shopStateUid] ??
            candidate)
          : null;
      return JSON.stringify(canonicalEntry(left)) === JSON.stringify(canonicalEntry(right));
    },
    [loaderData.shopStateUid],
  );
  const goals = entry.goals;
  const progress = useMemo(
    () => ({ ...entry.progress, clearedStageUids: planContext.jankenClearedStageUids }),
    [entry.progress, planContext.jankenClearedStageUids],
  );
  const available = config.status === "available";
  const studentUid = available ? loaderData.studentGrowthUid : null;
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
  const linkedShopCurrencyLedger =
    available && shopUid
      ? calculateResourceLedger({
          shopResources: planContext.shopResources,
          itemQuantities: planContext.state.itemQuantities,
          itemPurchaseDays: planContext.state.itemPurchaseDays,
          existingPaymentItemQuantities: planContext.state.existingPaymentItemQuantities,
          stages: planContext.stages,
          includeFirstClear: planContext.state.includeFirstClear,
          minigameStartRound: planContext.state.minigameStartRound,
          minigamePlayCount: 0,
          jankenStagePlays: {},
          jankenClearedStageUids: planContext.jankenClearedStageUids,
          minigameConfig: planContext.minigameConfig,
          overriddenRequiredQuantities: planContext.state.overriddenRequiredQuantities,
        })
      : null;
  const linkedShopCurrencyRequired = shopUid ? (linkedShopCurrencyLedger?.remainingToFarm[shopUid] ?? 0) : 0;
  const linkedShopCurrencyTotal = shopUid ? (linkedShopCurrencyLedger?.requiredTotals[shopUid] ?? 0) : 0;
  const linkedShopCurrencyOwned = shopUid ? (linkedShopCurrencyLedger?.existing[shopUid] ?? 0) : 0;
  const growthNeeded = available
    ? (getJankenStudentGrowthRequired(progress.currentTier, goals.targetTier, progress.heldEleph) ?? 0)
    : 0;
  const growthTotalRequired =
    available && goals.targetTier != null && goals.targetTier > progress.currentTier
      ? calculateCumulativeTierEleph(progress.currentTier, goals.targetTier)
      : 0;
  const canPlan = available && shopUid !== null;
  const planned = useMemo(
    () =>
      canPlan
        ? planJanken(config, {
            progress,
            goals,
            shopCurrencyRequired: linkedShopCurrencyRequired,
            studentGrowthTotalRequired: growthTotalRequired,
            shopCurrencyResourceUid: shopUid,
            ...(studentUid ? { studentGrowthResourceUid: studentUid } : {}),
          })
        : null,
    [canPlan, config, progress, goals, growthTotalRequired, shopUid, studentUid, linkedShopCurrencyRequired],
  );

  useEffect(() => {
    if (loaderData.signedIn) return;
    const snapshot = readGuestPlanner();
    if (snapshot.status === "ready") {
      const stored = snapshot.envelope.document.jankenProgress[loaderData.shopStateUid];
      if (stored) {
        setEntry(stored);
        planContext.setJankenClearedStageUids(stored.progress.clearedStageUids);
        setHasSavedEntry(true);
        baseRef.current = stored;
      }
    } else setSaveError(t.guestSaveFailed);
  }, [loaderData.shopStateUid, loaderData.signedIn, planContext.setJankenClearedStageUids]);

  useEffect(() => {
    if (!hasEdited || isConflict || fetcher.state !== "idle" || entriesEqual(entry, baseRef.current)) return;
    const timeout = setTimeout(() => {
      if (loaderData.signedIn) {
        submittedEntryRef.current = entry;
        fetcher.submit(
          { shopStateUid: loaderData.shopStateUid, entry, base: baseRef.current },
          { method: "post", action: "/api/planner/janken", encType: "application/json" },
        );
      } else {
        void updateGuestPlanner((envelope) => ({
          ...envelope,
          document: {
            ...envelope.document,
            jankenProgress: { ...envelope.document.jankenProgress, [loaderData.shopStateUid]: entry },
          },
        }))
          .then((snapshot) => {
            if (snapshot.status === "ready") {
              baseRef.current = entry;
              setHasSavedEntry(true);
              setSaveError(null);
            } else setSaveError(t.guestSaveFailed);
          })
          .catch(() => setSaveError(t.guestSaveFailed));
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [
    entry,
    entriesEqual,
    fetcher,
    fetcher.state,
    hasEdited,
    isConflict,
    loaderData.shopStateUid,
    loaderData.signedIn,
  ]);

  useEffect(() => {
    const response = fetcher.data;
    if (!response || handledResponseRef.current === response) return;
    handledResponseRef.current = response;
    if (response.success && response.entry) {
      baseRef.current = response.entry;
      setHasSavedEntry(true);
      setIsConflict(false);
      setSaveError(null);
      setHasEdited(!entriesEqual(entryRef.current, submittedEntryRef.current ?? response.entry));
      submittedEntryRef.current = null;
    }
    if (response.conflict) {
      setLatestConflict(response.latest ?? null);
      setIsConflict(true);
    }
  }, [entriesEqual, fetcher.data]);

  const updateProgress = (patch: Partial<JankenPlannerEntry["progress"]>) => {
    if (patch.clearedStageUids) planContext.setJankenClearedStageUids(patch.clearedStageUids);
    setHasEdited(true);
    setEntry((current) => ({ ...current, progress: { ...current.progress, ...patch } }));
  };
  const updateGoals = (patch: Partial<JankenPlannerEntry["goals"]>) => {
    setHasEdited(true);
    setEntry((current) => ({ ...current, goals: { ...current.goals, ...patch } }));
  };
  const apply = () => {
    if (planned?.status === "available") planContext.actions.setJankenStagePlays(planned.stagePlays);
  };
  const serializePlays = (plays: Record<string, number>) =>
    JSON.stringify(Object.fromEntries(Object.entries(plays).sort(([a], [b]) => a.localeCompare(b))));
  const applied =
    planned?.status === "available" &&
    serializePlays(planContext.state.jankenStagePlays) === serializePlays(planned.stagePlays);
  const ap = useMemo(() => {
    if (planned?.status !== "available") return null;
    return calculateShopApRequirement({
      state: { ...planContext.state, minigamePlayCount: 0, jankenStagePlays: planned.stagePlays },
      stages: planContext.stages,
      shopResources: planContext.shopResources,
      appliedBonusRatio: planContext.appliedBonusRatio,
      minigameConfig: planContext.minigameConfig,
      jankenClearedStageUids: progress.clearedStageUids,
    }).totalApWithExtras;
  }, [planned, planContext, progress.clearedStageUids]);
  const rewardTotals = planned?.status === "available" ? planned.rewards : {};
  const targetEquipmentTier = goals.targetEquipmentTier;
  const equipmentRequired =
    config.status === "available" && targetEquipmentTier != null
      ? config.equipmentUpgrade.tierCosts
          .filter(({ tier }) => tier > progress.equipmentTier && tier <= targetEquipmentTier)
          .reduce((sum, item) => sum + item.quantity, 0)
      : 0;
  const goalRows = useMemo(() => {
    if (!available) return [];
    const rows: { label: string; iconUid?: string; iconKind?: "score"; have: number; need: number; done: boolean }[] =
      [];
    if (studentUid && goals.targetTier != null) {
      const have = progress.heldEleph + (rewardTotals[studentUid] ?? 0);
      rows.push({
        label: t.studentGrowth,
        iconUid: studentUid,
        have,
        need: growthTotalRequired,
        done: have >= growthTotalRequired,
      });
    }
    if (shopUid && goals.shopCurrencyMode === "linked") {
      const owned = planContext.state.existingPaymentItemQuantities[shopUid] ?? 0;
      const need = owned + linkedShopCurrencyRequired;
      const have = owned + (rewardTotals[shopUid] ?? 0);
      rows.push({ label: t.shopCurrency, iconUid: shopUid, have, need, done: have >= need });
    } else if (shopUid && goals.manualShopCurrency > 0) {
      const have = rewardTotals[shopUid] ?? 0;
      rows.push({
        label: t.shopCurrency,
        iconUid: shopUid,
        have,
        need: goals.manualShopCurrency,
        done: have >= goals.manualShopCurrency,
      });
    }
    if (goals.targetScore != null)
      rows.push({
        label: t.scoreGoal,
        iconKind: "score",
        have: planned?.projectedScore ?? progress.cumulativeScore,
        need: goals.targetScore,
        done: (planned?.projectedScore ?? progress.cumulativeScore) >= goals.targetScore,
      });
    if (targetEquipmentTier != null && config.status === "available" && config.equipmentUpgrade.costResource) {
      const uid = config.equipmentUpgrade.costResource.resourceUid;
      const have = progress.heldEquipmentCurrency + (rewardTotals[uid] ?? 0);
      rows.push({
        label: t.equipmentGoalTier(targetEquipmentTier),
        iconUid: uid,
        have,
        need: equipmentRequired,
        done: have >= equipmentRequired,
      });
    }
    return rows;
  }, [
    available,
    studentUid,
    goals.targetTier,
    goals.shopCurrencyMode,
    goals.manualShopCurrency,
    goals.targetScore,
    targetEquipmentTier,
    progress,
    rewardTotals,
    shopUid,
    planContext.state.existingPaymentItemQuantities,
    linkedShopCurrencyRequired,
    planned?.projectedScore,
    equipmentRequired,
    growthTotalRequired,
    config,
  ]);
  const achievedCount = goalRows.filter(({ done }) => done).length;
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
          <header>
            <p className="text-xs text-v2-fg-tertiary">
              {loaderData.eventName} › {t.shopBreadcrumb}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-v2-fg">{t.pageTitle}</h1>
            <p className="mt-1 text-sm text-v2-fg-secondary">{t.lead}</p>
          </header>
          {!available ? (
            <StatusNotice tone={config.status === "invalid" ? "danger" : "neutral"}>
              {config.status === "invalid" ? t.invalid : t.unavailable}
            </StatusNotice>
          ) : null}
          {available && !shopUid ? <StatusNotice tone="danger">{t.invalid}</StatusNotice> : null}
          {isConflict ? (
            <StatusNotice
              tone="danger"
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const latest = latestConflict ?? defaultEntry;
                      setEntry(latest);
                      submittedEntryRef.current = null;
                      planContext.setJankenClearedStageUids(latest.progress.clearedStageUids);
                      baseRef.current = latestConflict;
                      setLatestConflict(null);
                      setIsConflict(false);
                      setHasEdited(false);
                    }}
                  >
                    {t.reload}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      baseRef.current = latestConflict;
                      setLatestConflict(null);
                      setIsConflict(false);
                      submittedEntryRef.current = entry;
                      fetcher.submit(
                        { shopStateUid: loaderData.shopStateUid, entry, base: latestConflict },
                        { method: "post", action: "/api/planner/janken", encType: "application/json" },
                      );
                    }}
                  >
                    {t.overwrite}
                  </Button>
                </div>
              }
            >
              {fetcher.data?.error ?? t.conflict}
            </StatusNotice>
          ) : null}
          {fetcher.data?.error && !fetcher.data.conflict ? (
            <StatusNotice tone="danger">{fetcher.data.error}</StatusNotice>
          ) : null}
          {saveError ? <StatusNotice tone="danger">{saveError}</StatusNotice> : null}
          {available ? (
            <>
              <ShopSection
                title={t.progress}
                persistenceKey="event-shop-section::janken-progress"
                variant="shop"
                action={
                  <span className="text-xs font-normal text-v2-fg-tertiary">
                    {loaderData.signedIn ? t.savedAccount : t.savedGuest}
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {studentUid ? (
                    <article className="rounded-lg bg-v2-surface p-v2-block-p">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold">
                        <ResourceThumb itemUid={studentUid} name={t.studentGrowth} size="sm" />
                        {t.studentGrowth}
                      </h3>
                      <p className="text-xs text-v2-fg-secondary">{t.currentTier}</p>
                      <fieldset
                        aria-label={t.currentTier}
                        className="m-0 mt-2 flex min-w-0 flex-wrap gap-1 border-0 p-0"
                      >
                        {Array.from({ length: 9 }, (_, i) => i + 1).map((tier) => (
                          <ToggleChip
                            key={tier}
                            pressed={progress.currentTier === tier}
                            ariaLabel={t.tierLabel(tier)}
                            onPressedChange={() => updateProgress({ currentTier: tier })}
                          >
                            <span className="flex items-center gap-1">
                              {tier <= 5 ? (
                                <StarIcon className="size-3.5 text-v2-warning" aria-hidden="true" />
                              ) : (
                                <SparklesIcon className="size-3.5 text-v2-fg-secondary" aria-hidden="true" />
                              )}
                              {tier <= 5 ? tier : tier - 5}
                            </span>
                          </ToggleChip>
                        ))}
                      </fieldset>
                      {!hasSavedEntry ? (
                        <p className="mt-2 text-xs text-v2-fg-tertiary">
                          {loaderData.recruitedStudent ? (
                            <>
                              <Link className="text-v2-link" to={`/students/${studentUid}`}>
                                {t.recruitedSourceLabel}
                              </Link>
                              {t.recruitedSourceSuffix}
                            </>
                          ) : (
                            t.initialTierNotice
                          )}
                        </p>
                      ) : null}
                      <label htmlFor="janken-held-student" className="mt-4 block text-xs text-v2-fg-secondary">
                        {t.heldCount}
                      </label>
                      <NumberInput
                        id="janken-held-student"
                        aria-label={`${t.studentGrowth} · ${t.heldCount}`}
                        className="mt-1 w-full"
                        grouped
                        min={0}
                        value={progress.heldEleph}
                        onValueChange={(heldEleph) => updateProgress({ heldEleph: Math.max(0, Math.trunc(heldEleph)) })}
                      />
                      {!hasSavedEntry && loaderData.signedIn ? (
                        <p className="mt-2 text-xs text-v2-fg-tertiary">
                          <Link className="text-v2-link" to="/utils/resources/inventory">
                            {t.inventoryPlanner}
                          </Link>
                          {t.inventorySourceSuffix(loaderData.inventoryDate)}
                        </p>
                      ) : null}
                    </article>
                  ) : (
                    <article className="rounded-lg bg-v2-surface p-v2-block-p">
                      <h3 className="mb-3 font-semibold">{t.studentGrowth}</h3>
                      <StatusNotice tone="neutral">{t.studentGrowthUnavailable}</StatusNotice>
                    </article>
                  )}
                  <article className="rounded-lg bg-v2-surface p-v2-block-p">
                    <h3 className="mb-3 font-semibold">{t.scoreEquipment}</h3>
                    <label htmlFor="janken-current-score" className="block text-xs text-v2-fg-secondary">
                      {t.challengeScore}
                    </label>
                    <NumberInput
                      id="janken-current-score"
                      aria-label={t.challengeScore}
                      className="mt-1 w-full"
                      grouped
                      formatThousands
                      min={0}
                      value={progress.cumulativeScore}
                      onValueChange={(cumulativeScore) =>
                        updateProgress({ cumulativeScore: Math.max(0, Math.trunc(cumulativeScore)) })
                      }
                    />
                    <p className="mt-3 text-xs text-v2-fg-secondary">{t.currentEquipmentTier}</p>
                    <fieldset
                      aria-label={t.currentEquipmentTier}
                      className="m-0 mt-2 flex min-w-0 flex-wrap gap-1 border-0 p-0"
                    >
                      {Array.from({ length: config.equipmentUpgrade.maxTier }, (_, i) => i + 1).map((tier) => (
                        <ToggleChip
                          key={tier}
                          pressed={progress.equipmentTier === tier}
                          ariaLabel={t.equipmentGoalTier(tier)}
                          onPressedChange={() => updateProgress({ equipmentTier: tier })}
                        >
                          T{tier}
                        </ToggleChip>
                      ))}
                    </fieldset>
                    <label htmlFor="janken-held-equipment-currency" className="mt-4 block text-xs text-v2-fg-secondary">
                      {t.heldEquipmentCurrency}
                    </label>
                    <NumberInput
                      id="janken-held-equipment-currency"
                      aria-label={t.heldEquipmentCurrency}
                      className="mt-1 w-full"
                      grouped
                      min={0}
                      value={progress.heldEquipmentCurrency}
                      onValueChange={(heldEquipmentCurrency) =>
                        updateProgress({ heldEquipmentCurrency: Math.max(0, Math.trunc(heldEquipmentCurrency)) })
                      }
                    />
                  </article>
                  <article className="rounded-lg bg-v2-surface p-v2-block-p sm:col-span-2">
                    <h3 className="font-semibold">{t.clearedStages}</h3>
                    <div className="mt-2 flex flex-wrap gap-1">
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
                    <p className="mt-2 text-xs text-v2-fg-tertiary">{t.firstClearHelp}</p>
                  </article>
                </div>
              </ShopSection>
              <ShopSection title={t.goals} persistenceKey="event-shop-section::janken-goals" variant="shop">
                <div className="grid gap-3 sm:grid-cols-2">
                  {studentUid ? (
                    <article className="rounded-lg bg-v2-surface p-v2-block-p">
                      <h3 className="flex items-center gap-2 font-semibold">
                        <ResourceThumb itemUid={studentUid} name={t.studentGrowth} size="sm" />
                        {t.studentGoal}
                      </h3>
                      <p className="mt-3 text-xs text-v2-fg-secondary">{t.targetTier}</p>
                      <fieldset
                        aria-label={t.targetTier}
                        className="m-0 mt-2 flex min-w-0 flex-wrap gap-1 border-0 p-0"
                      >
                        {[3, 4, 6, 7, 8, 9].map((tier) => (
                          <ToggleChip
                            key={tier}
                            disabled={tier <= progress.currentTier && goals.targetTier !== tier}
                            pressed={goals.targetTier === tier}
                            ariaLabel={t.tierLabel(tier)}
                            onPressedChange={() => updateGoals({ targetTier: goals.targetTier === tier ? null : tier })}
                          >
                            <span className="flex items-center gap-1">
                              {tier <= 5 ? (
                                <StarIcon className="size-3.5 text-v2-warning" aria-hidden="true" />
                              ) : (
                                <SparklesIcon className="size-3.5 text-v2-fg-secondary" aria-hidden="true" />
                              )}
                              {tier <= 5 ? tier : tier - 5}
                            </span>
                          </ToggleChip>
                        ))}
                      </fieldset>
                      {goals.targetTier != null ? (
                        <div className="mt-3 rounded-md bg-v2-inset px-3 py-2">
                          <p className="flex items-center gap-2 text-xs text-v2-fg-secondary">
                            <ResourceThumb itemUid={studentUid} name={t.studentGrowth} size="sm" />
                            {t.studentGrowthGoalDetail(
                              t.tierLabel(progress.currentTier),
                              growthTotalRequired,
                              progress.heldEleph,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-v2-fg-tertiary">{t.remainingCount(growthNeeded)}</p>
                        </div>
                      ) : null}
                    </article>
                  ) : null}
                  <article className="rounded-lg bg-v2-surface p-v2-block-p">
                    <h3 className="flex items-center gap-2 font-semibold">
                      {shopUid ? <ResourceThumb itemUid={shopUid} name={t.shopCurrency} size="sm" /> : null}
                      {t.shopGoal}
                    </h3>
                    <Switch
                      id="janken-shop-linked"
                      checked={goals.shopCurrencyMode === "linked"}
                      onCheckedChange={(on) => updateGoals({ shopCurrencyMode: on ? "linked" : "manual" })}
                      label={t.shopLinkedSwitch}
                    />
                    {shopUid && goals.shopCurrencyMode === "linked" ? (
                      <p className="mt-2 rounded-md bg-v2-inset px-3 py-2 text-xs text-v2-fg-secondary">
                        {t.shopLinkedBalance(
                          linkedShopCurrencyTotal,
                          linkedShopCurrencyOwned,
                          linkedShopCurrencyRequired,
                        )}
                      </p>
                    ) : null}
                    {goals.shopCurrencyMode === "manual" ? (
                      <>
                        <label
                          htmlFor="janken-manual-shop-currency"
                          className="mt-3 block text-xs text-v2-fg-secondary"
                        >
                          {t.manualShopCurrency}
                        </label>
                        <NumberInput
                          id="janken-manual-shop-currency"
                          aria-label={t.manualShopCurrency}
                          className="mt-1 w-full"
                          grouped
                          min={0}
                          value={goals.manualShopCurrency}
                          onValueChange={(manualShopCurrency) =>
                            updateGoals({ manualShopCurrency: Math.max(0, Math.trunc(manualShopCurrency)) })
                          }
                        />
                      </>
                    ) : null}
                  </article>
                  <article className="rounded-lg bg-v2-surface p-v2-block-p">
                    <h3 className="font-semibold">{t.scoreGoal}</h3>
                    <label htmlFor="janken-target-score" className="mt-2 block text-xs text-v2-fg-secondary">
                      {t.targetScore}
                    </label>
                    <NumberInput
                      id="janken-target-score"
                      aria-label={t.targetScore}
                      className="mt-1 w-full"
                      grouped
                      formatThousands
                      min={0}
                      value={goals.targetScore ?? 0}
                      onValueChange={(targetScore) =>
                        updateGoals({ targetScore: Math.max(0, Math.trunc(targetScore)) || null })
                      }
                    />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {scorePresets(config, studentUid).map(({ score, tier }) => (
                        <ToggleChip
                          key={score}
                          pressed={goals.targetScore === score}
                          ariaLabel={t.scorePreset(score, tier)}
                          onPressedChange={() =>
                            updateGoals({ targetScore: goals.targetScore === score ? null : score })
                          }
                        >
                          {t.scorePreset(score, tier)}
                        </ToggleChip>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <label htmlFor="janken-average-score" className="text-xs text-v2-fg-secondary">
                        {t.averageScore}
                      </label>
                      {planned?.status === "score-input-required" ? (
                        <span
                          id="janken-average-score-required"
                          role="status"
                          className="text-xs font-medium text-v2-warning"
                        >
                          {t.scoreInputRequired}
                        </span>
                      ) : null}
                    </div>
                    <NumberInput
                      id="janken-average-score"
                      aria-label={t.averageScore}
                      aria-describedby={
                        planned?.status === "score-input-required" ? "janken-average-score-required" : undefined
                      }
                      className="mt-1 w-full"
                      grouped
                      formatThousands
                      min={0}
                      value={goals.averageScore ?? ""}
                      onValueChange={(averageScore) =>
                        updateGoals({ averageScore: Math.max(0, Math.trunc(averageScore)) || null })
                      }
                    />
                    <p className="mt-2 rounded-md bg-v2-inset px-3 py-2 text-xs text-v2-fg-tertiary">
                      {t.scoreProgress(
                        progress.cumulativeScore,
                        Math.max(0, (goals.targetScore ?? 0) - progress.cumulativeScore),
                      )}
                    </p>
                  </article>
                  <article className="rounded-lg bg-v2-surface p-v2-block-p">
                    <h3 className="font-semibold">{t.equipmentGoal}</h3>
                    <p className="mt-3 text-xs text-v2-fg-secondary">{t.equipmentTargetTier}</p>
                    <fieldset
                      aria-label={t.equipmentTargetTier}
                      className="m-0 mt-2 flex min-w-0 flex-wrap gap-1 border-0 p-0"
                    >
                      {Array.from({ length: config.equipmentUpgrade.maxTier }, (_, i) => i + 1).map((tier) => (
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
                      ))}
                    </fieldset>
                    <p className="mt-2 text-xs text-v2-fg-tertiary">{t.equipmentBatchHelp}</p>
                    {goals.targetEquipmentTier != null ? (
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-v2-inset px-3 py-2 text-xs text-v2-fg-secondary">
                        {config.equipmentUpgrade.costResource ? (
                          <ResourceThumb
                            itemUid={config.equipmentUpgrade.costResource.resourceUid}
                            name={t.equipmentCurrency}
                            size="sm"
                          />
                        ) : null}
                        {t.equipmentRequirement(
                          equipmentRequired,
                          progress.heldEquipmentCurrency,
                          Math.max(0, equipmentRequired - progress.heldEquipmentCurrency),
                        )}
                      </div>
                    ) : null}
                  </article>
                </div>
              </ShopSection>
              <ShopSection title={t.steps} persistenceKey="event-shop-section::janken-steps" variant="shop">
                {planned?.status === "score-input-required" ? (
                  <StatusNotice tone="neutral">{t.scoreAverageRequired}</StatusNotice>
                ) : planned?.status === "invalid" ? (
                  <StatusNotice tone="danger">{t.invalid}</StatusNotice>
                ) : planned?.status === "available" && planned.planSteps.length === 0 ? (
                  <StatusNotice tone="neutral">{t.allGoalsMet}</StatusNotice>
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
                      {config.scoreRewards.slice(0, showAllScoreRewards ? undefined : 10).map((reward) => (
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
          <p className="text-2xl font-bold tabular-nums">
            {planned?.status === "available" ? planned.entryCost.toLocaleString() : "—"}
          </p>
          <p className="mt-3 text-xs text-v2-fg-tertiary">{t.requiredApTitle}</p>
          <p className="mt-1 text-lg font-semibold">{ap == null ? "—" : t.approximateAp(ap)}</p>
          <div className="mt-3 border-t border-v2-divider pt-3">
            {goalRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span className="flex items-center gap-2">
                  {row.iconUid ? (
                    <ResourceThumb itemUid={row.iconUid} name={row.label} size="sm" />
                  ) : row.iconKind === "score" ? (
                    <FlagIcon className="size-4 text-v2-fg-tertiary" aria-hidden="true" />
                  ) : null}
                  {row.label}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums">
                  {row.iconKind === "score" ? t.scoreInMan(row.have) : row.have.toLocaleString()} /{" "}
                  {row.iconKind === "score" ? t.scoreInMan(row.need) : row.need.toLocaleString()}{" "}
                  {row.done ? (
                    <span role="img" className="whitespace-nowrap text-v2-success" aria-label={t.achieved}>
                      ✓
                    </span>
                  ) : (
                    <span
                      role="img"
                      aria-label={t.notAchieved}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-v2-danger"
                    >
                      <ExclamationCircleIcon className="size-4" aria-hidden="true" />
                      <span>{t.notAchieved}</span>
                    </span>
                  )}
                </span>
              </div>
            ))}
            <p className="mt-2 text-xs text-v2-fg-tertiary">{t.goalBalanceHelp}</p>
          </div>
          <Button
            variant="primary"
            className="mt-4 w-full"
            disabled={planned?.status !== "available" || applied}
            onClick={apply}
          >
            {applied ? t.applied : t.applyPlan}
          </Button>
          <p className="mt-2 text-xs text-v2-fg-tertiary">{t.applyPlanHelp}</p>
        </PanelSheet>
        <div className="mt-3">
          <AsideLinks
            items={[
              {
                key: "shop",
                title: t.shopCalculator,
                description: t.shopCalculatorDescription,
                to: `/events/${loaderData.eventUid}/shop`,
                Icon: FlagIcon,
              },
            ]}
          />
        </div>
      </PageAside>
      {stacked ? (
        <PageActionBar
          placement="fixed"
          summary={
            <span className="text-sm font-semibold">
              <span className="flex items-center gap-1">
                {planned?.entryResourceUid ? (
                  <ResourceThumb itemUid={planned.entryResourceUid} name={t.entryCurrency} size="sm" />
                ) : null}
                {planned?.status === "available" ? planned.entryCost.toLocaleString() : "—"} ·{" "}
                {ap == null ? "—" : t.approximateAp(ap)}
              </span>
              <span className="text-xs font-normal text-v2-fg-tertiary">
                {t.goalCountSummary(goalRows.length, achievedCount)}
              </span>
            </span>
          }
        >
          <Button
            variant={applied ? "secondary" : "primary"}
            disabled={planned?.status !== "available" || applied}
            onClick={apply}
          >
            {applied ? t.applied : t.applyPlan}
          </Button>
        </PageActionBar>
      ) : null}
    </>
  );
}
