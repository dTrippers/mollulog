import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  FlagIcon,
} from "@heroicons/react/16/solid";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { MobileActionBar, PageAside, PageMain, PanelSheet, useV2Page } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { Select } from "~/components/v2/primitives/Select";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import type { JankenConfig } from "~/domain/event-shop";
import {
  evaluateJankenPlan,
  getJankenResourceRoles,
  getJankenScoreRewardWindow,
  getJankenStudentGrowthRequired,
  type JankenPlanStep,
  type JankenResourceRoles,
} from "~/domain/event-shop/janken";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { jankenLocale as t } from "~/locales/ko";
import type { loader } from "../events.$uid.shop.janken";
import { ShopSignInNote } from "./shop/ShopResultPanel";
import { CurrencyIcon, Pill, Segmented, ShopSection, ShopSectionHeader } from "./shop/shop-ui";

type LoaderData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;
type AvailableConfig = Extract<JankenConfig, { status: "available" }>;

const emptyResourceRoles: JankenResourceRoles = { entryUid: null, shopUid: null, studentUid: null, equipmentUid: null };
const expectedFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const formatExpected = (amount: number) => expectedFormat.format(amount);
const STUDENT_TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STUDENT_TARGET_TIERS = [3, 4, 6, 7, 8, 9];

// Resource display names come from the event data; whitespace (BAQL names may contain line breaks) is collapsed.
function collectResourceNames(config: AvailableConfig): Map<string, string> {
  const names = new Map<string, string>();
  const add = (uid: string, name: string | undefined) => {
    const normalized = name?.replace(/\s+/g, " ").trim();
    if (normalized && !names.has(uid)) names.set(uid, normalized);
  };
  for (const stage of config.stages) {
    add(stage.entryCost.resourceUid, stage.entryCost.resourceName);
    for (const reward of stage.rewards) add(reward.resourceUid, reward.resourceName);
  }
  for (const row of config.scoreRewards) for (const reward of row.rewards) add(reward.resourceUid, reward.resourceName);
  if (config.equipmentUpgrade.costResource) {
    add(config.equipmentUpgrade.costResource.resourceUid, config.equipmentUpgrade.costResource.resourceName);
  }
  return names;
}

const stageLabel = (config: AvailableConfig, stageUid: string) => {
  const stage = config.stages.find(({ uid }) => uid === stageUid);
  if (!stage) return t.challengeStage;
  return stage.stageType === "story"
    ? t.storyStage(stage.stageNumber)
    : stage.stageType === "normal"
      ? t.normalStage(stage.stageNumber)
      : t.challengeStage;
};

function stageClearChain(config: AvailableConfig, stageUid: string): string[] {
  const byUid = new Map(config.stages.map((stage) => [stage.uid, stage]));
  const chain: string[] = [];
  let stage = byUid.get(stageUid);
  while (stage && !chain.includes(stage.uid)) {
    chain.push(stage.uid);
    stage = stage.previousStageUid ? byUid.get(stage.previousStageUid) : undefined;
  }
  return chain;
}

// Plays split into the largest multiplier the stage allows, then one run for the remainder.
function multiplierRuns(plays: number, max: number) {
  if (max <= 1) return [];
  const full = Math.floor(plays / max);
  const remainder = plays % max;
  return [
    ...(full > 0 ? [{ multiplier: max, count: full }] : []),
    ...(remainder > 0 ? [{ multiplier: remainder, count: 1 }] : []),
  ];
}

type StepRow = {
  key: string;
  kind: JankenPlanStep["kind"];
  stageUids: string[];
  plays: number;
  cost: number;
  entryUid: string;
  rewards: { uid: string; quantity: number }[];
  scoreGain: number;
  equipmentHave: number;
  studentHave: number;
  multiplier: boolean;
};

// Walks the plan in order. Consecutive first clears read as one step; later steps carry the running totals so each
// row can say how far its goal has come.
function buildStepRows(
  config: AvailableConfig,
  steps: JankenPlanStep[],
  start: { cleared: string[]; score: number; averageScore: number | null; equipmentHave: number; studentHave: number },
  roles: JankenResourceRoles,
): StepRow[] {
  const cleared = new Set(start.cleared);
  let score = start.score;
  let equipmentHave = start.equipmentHave;
  let studentHave = start.studentHave;
  const rewardUids = [
    ...new Set([roles.studentUid, roles.shopUid, roles.equipmentUid].filter((uid): uid is string => Boolean(uid))),
  ];
  const rows: StepRow[] = [];
  for (const step of steps) {
    const stage = config.stages.find(({ uid }) => uid === step.stageUid);
    if (!stage) continue;
    const evaluated = evaluateJankenPlan(config, {
      stagePlays: { [step.stageUid]: step.plays },
      clearedStageUids: [...cleared],
      currentScore: score,
      averageScore: start.averageScore,
    });
    const scoreGain = Math.max(0, evaluated.projectedScore - score);
    score = evaluated.projectedScore;
    if (roles.equipmentUid) equipmentHave += evaluated.rewards[roles.equipmentUid] ?? 0;
    if (roles.studentUid) studentHave += evaluated.rewards[roles.studentUid] ?? 0;
    for (const uid of stageClearChain(config, step.stageUid)) cleared.add(uid);
    const rewards = rewardUids.map((uid) => ({ uid, quantity: evaluated.rewards[uid] ?? 0 }));
    const cost = stage.entryCost.quantity * step.plays;
    const previous = rows.at(-1);
    if (step.kind === "prerequisite" && previous?.kind === "prerequisite") {
      previous.stageUids.push(step.stageUid);
      previous.plays += step.plays;
      previous.cost += cost;
      previous.rewards = previous.rewards.map((reward, index) => ({
        ...reward,
        quantity: reward.quantity + (rewards[index]?.quantity ?? 0),
      }));
      continue;
    }
    rows.push({
      key: `${step.kind}:${step.stageUid}`,
      kind: step.kind,
      stageUids: [step.stageUid],
      plays: step.plays,
      cost,
      entryUid: stage.entryCost.resourceUid,
      rewards,
      scoreGain,
      equipmentHave,
      studentHave,
      multiplier: stage.stageType === "normal" && (step.kind === "equipment" || step.kind === "remaining"),
    });
  }
  return rows.map((row) => ({ ...row, rewards: row.rewards.filter(({ quantity }) => quantity > 0) }));
}

// Score goals offered in the selector: every reward tier, plus a saved value that is not on a tier.
function scoreTargetOptions(config: AvailableConfig, targetScore: number | null) {
  const options = config.scoreRewards.map(({ score, tier }) => ({
    value: String(score),
    label: t.scorePreset(score, tier),
  }));
  if (targetScore != null && !config.scoreRewards.some(({ score }) => score === targetScore)) {
    options.push({ value: String(targetScore), label: `${targetScore.toLocaleString()}점` });
  }
  return [{ value: "none", label: t.noGoal }, ...options];
}

export default function JankenScreen({ loaderData }: { loaderData: LoaderData }) {
  const plan = useOutletContext<EventShopPlanContext>();
  const { stacked, openSheet, sheetPanelId } = useV2Page();
  const persistence = plan.jankenPersistence;
  const config: JankenConfig =
    plan.minigameConfig?.minigameType === "janken"
      ? (plan.minigameConfig.janken ?? { status: "unavailable" })
      : { status: "unavailable" };
  const available = config.status === "available";
  const entry = plan.jankenEntry;
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const goals = entry.goals;
  const progress = entry.progress;
  const studentUid = available ? (plan.jankenStudentGrowthUid ?? null) : null;
  const roles = useMemo(
    () =>
      config.status === "available"
        ? getJankenResourceRoles(
            config,
            plan.shopResources.map(({ paymentResource }) => paymentResource.uid),
            studentUid,
          )
        : emptyResourceRoles,
    [config, plan.shopResources, studentUid],
  );
  const resourceNames = useMemo(
    () => (config.status === "available" ? collectResourceNames(config) : new Map<string, string>()),
    [config],
  );
  const nameOf = (uid: string | null | undefined, fallback: string) =>
    (uid ? resourceNames.get(uid) : undefined) ?? fallback;
  const planned = plan.jankenPlan;
  const missingAverageScore = planned.status === "score-input-required";

  const updateProgress = (patch: Partial<JankenPlannerEntry["progress"]>) => {
    const next = { ...entryRef.current, progress: { ...entryRef.current.progress, ...patch } };
    entryRef.current = next;
    plan.setJankenEntry(next);
  };
  const updateGoals = (patch: Partial<JankenPlannerEntry["goals"]>) => {
    const next = { ...entryRef.current, goals: { ...entryRef.current.goals, ...patch } };
    entryRef.current = next;
    plan.setJankenEntry(next);
  };

  const equipmentRequired =
    config.status === "available" && goals.targetEquipmentTier != null
      ? config.equipmentUpgrade.tierCosts
          .filter(({ tier }) => tier > progress.equipmentTier && tier <= (goals.targetEquipmentTier ?? 0))
          .reduce((sum, item) => sum + item.quantity, 0)
      : 0;
  const studentRequired =
    available && goals.targetTier != null
      ? (getJankenStudentGrowthRequired(progress.currentTier, goals.targetTier, 0) ?? 0)
      : 0;
  const stepRows = useMemo(
    () =>
      config.status === "available" && planned.status === "available"
        ? buildStepRows(
            config,
            planned.planSteps,
            {
              cleared: progress.clearedStageUids,
              score: progress.cumulativeScore,
              averageScore: goals.averageScore,
              equipmentHave: progress.heldEquipmentCurrency,
              studentHave: progress.heldEleph,
            },
            roles,
          )
        : [],
    [
      config,
      planned,
      progress.clearedStageUids,
      progress.cumulativeScore,
      goals.averageScore,
      progress.heldEquipmentCurrency,
      progress.heldEleph,
      roles,
    ],
  );

  const noGoals =
    goals.targetTier == null &&
    goals.targetScore == null &&
    goals.targetEquipmentTier == null &&
    goals.shopCurrencyMode === "linked";
  // A failed AP calculation must not read as a result: it shows the failure with a retry instead of 0 or the last AP.
  const apFailed = planned.status === "available" && plan.calculationFailed;
  const apPending = planned.status === "available" && !apFailed && plan.isCalculating;
  const ap =
    planned.status === "available" && !apPending && !apFailed ? plan.stageCalculations.totalApWithExtras : null;
  const apText =
    ap == null ? (apFailed ? t.calculationFailed : apPending ? t.calculationPending : "—") : t.approximate(ap);
  const entryUid = planned.entryResourceUid;
  const entryName = nameOf(entryUid, t.entryCurrency);
  const entryCostText = planned.status === "available" ? planned.entryCost.toLocaleString() : "—";

  const summary = (
    <>
      <p className="text-xs text-v2-fg-tertiary">{t.entryCurrencyRequired}</p>
      <p className="mt-1 flex items-center gap-1.5">
        {entryUid ? <CurrencyIcon uid={entryUid} name={entryName} size="lg" /> : null}
        <span className="text-[1.75rem] leading-[1.2] font-bold tabular-nums">{entryCostText}</span>
      </p>
      {missingAverageScore ? <p className="mt-2 text-xs text-v2-warning">{t.scoreAverageSummary}</p> : null}
      {config.status === "available" && stepRows.length > 0 ? (
        <dl className="mt-2 flex flex-col">
          {summaryRows(config, stepRows).map(({ label, cost }) => (
            <div key={label} className="flex min-h-[1.625rem] items-center justify-between text-[0.8125rem]">
              <dt className="text-v2-fg-tertiary">{label}</dt>
              <dd className="tabular-nums text-v2-fg-secondary">{cost.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-3 h-px bg-v2-divider" />
      <p className="mt-3 text-xs text-v2-fg-tertiary">{t.requiredApTitle}</p>
      {apFailed ? (
        <div role="alert" className="mt-1 flex flex-col items-start gap-2">
          <p className="text-sm font-medium text-v2-danger">{apText}</p>
          <Button size="sm" onClick={plan.retryCalculation}>
            <ArrowPathIcon className="size-4" aria-hidden="true" />
            {t.retryCalculation}
          </Button>
        </div>
      ) : (
        <p
          className={cn(
            "text-2xl leading-[1.2] font-bold tabular-nums",
            ap == null ? "text-v2-fg-tertiary" : "text-v2-ap",
          )}
        >
          {apText}
        </p>
      )}
      <Link
        to={`/events/${loaderData.eventUid}/shop`}
        className={cn(
          "mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-v2-link hover:underline",
          v2FocusRing,
        )}
      >
        {t.shopCalculatorLink}
        <ArrowRightIcon className="size-3.5" aria-hidden="true" />
      </Link>
    </>
  );

  return (
    <>
      <PageMain>
        <div className="flex flex-col gap-9">
          {config.status !== "available" ? (
            <StatusNotice tone={config.status === "invalid" ? "danger" : "neutral"}>
              {config.status === "invalid" ? t.invalid : t.unavailable}
            </StatusNotice>
          ) : (
            <>
              {!roles.shopUid ? <StatusNotice tone="danger">{t.invalid}</StatusNotice> : null}
              <ConflictPrompt persistence={persistence} />
              <ShopSection id="janken-goals-title" region="janken-goals">
                <ShopSectionHeader id="janken-goals-title" title={t.goals} />
                <div className="@container">
                  <div className="grid grid-cols-1 gap-3 @min-[40rem]:grid-cols-2">
                    {studentUid ? (
                      <StudentGoalCard
                        uid={studentUid}
                        name={nameOf(studentUid, t.studentUnknownName)}
                        currentTier={progress.currentTier}
                        targetTier={goals.targetTier}
                        held={progress.heldEleph}
                        shortfall={Math.max(0, studentRequired - progress.heldEleph)}
                        onHeldChange={(heldEleph) => updateProgress({ heldEleph })}
                        onCurrentTierChange={(currentTier) => updateProgress({ currentTier })}
                        onTargetTierChange={(targetTier) => updateGoals({ targetTier })}
                      />
                    ) : (
                      <UnknownStudentCard targetTier={goals.targetTier} />
                    )}
                    <EquipmentGoalCard
                      config={config}
                      name={nameOf(
                        roles.equipmentUid ?? config.equipmentUpgrade.costResource?.resourceUid,
                        t.equipmentGoal,
                      )}
                      currentTier={progress.equipmentTier}
                      targetTier={goals.targetEquipmentTier}
                      held={progress.heldEquipmentCurrency}
                      shortfall={Math.max(0, equipmentRequired - progress.heldEquipmentCurrency)}
                      onHeldChange={(heldEquipmentCurrency) => updateProgress({ heldEquipmentCurrency })}
                      onCurrentTierChange={(equipmentTier) => updateProgress({ equipmentTier })}
                      onTargetTierChange={(targetEquipmentTier) => updateGoals({ targetEquipmentTier })}
                    />
                    <ScoreGoalCard
                      config={config}
                      iconUid={roles.entryUid}
                      current={progress.cumulativeScore}
                      targetScore={goals.targetScore}
                      averageScore={goals.averageScore}
                      missingAverage={missingAverageScore}
                      onCurrentChange={(cumulativeScore) => updateProgress({ cumulativeScore })}
                      onTargetChange={(targetScore) => updateGoals({ targetScore })}
                      onAverageChange={(averageScore) => updateGoals({ averageScore })}
                    />
                    {roles.shopUid ? (
                      <ShopCurrencyGoalCard
                        uid={roles.shopUid}
                        name={nameOf(roles.shopUid, t.shopCurrency)}
                        mode={goals.shopCurrencyMode}
                        manual={goals.manualShopCurrency}
                        linkedShortfall={plan.jankenShopCurrency.required}
                        owned={plan.jankenShopCurrency.owned}
                        onModeChange={(shopCurrencyMode) => updateGoals({ shopCurrencyMode })}
                        onManualChange={(manualShopCurrency) => updateGoals({ manualShopCurrency })}
                        onOwnedChange={(owned) => plan.actions.updateExistingQuantity(roles.shopUid ?? "", owned)}
                      />
                    ) : null}
                  </div>
                </div>
                {studentUid && !persistence.hasSavedEntry ? (
                  <p className="text-xs text-v2-fg-tertiary">
                    {plan.recruitedStudentUids.includes(studentUid) ? (
                      <>
                        <Link className="text-v2-link hover:underline" to={`/students/${studentUid}`}>
                          {t.recruitedSourceLabel}
                        </Link>
                        {t.recruitedSourceSuffix}
                      </>
                    ) : (
                      t.initialTierNotice
                    )}
                    {plan.signedIn ? (
                      <>
                        {" · "}
                        <Link className="text-v2-link hover:underline" to="/utils/resources/inventory">
                          {t.inventoryPlanner}
                        </Link>
                        {t.inventorySourceSuffix(loaderData.inventoryDate)}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </ShopSection>

              <ClearedStagesSection
                config={config}
                cleared={progress.clearedStageUids}
                onChange={(clearedStageUids) => updateProgress({ clearedStageUids })}
              />

              <ShopSection id="janken-steps-title" region="recommended-steps">
                <ShopSectionHeader id="janken-steps-title" title={t.steps} />
                {noGoals ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-v2-surface p-4">
                    <p className="text-sm text-v2-fg">
                      {t.noGoalsLead}
                      <b className="font-semibold">{nameOf(roles.shopUid, t.shopCurrency)}</b>
                      {t.noGoalsTail}
                    </p>
                    <div className="flex min-h-6 items-baseline justify-between gap-2 text-[0.8125rem]">
                      <span className="text-v2-fg-tertiary">{t.entryCurrencyRequired}</span>
                      <span className="font-semibold tabular-nums">{entryCostText}</span>
                    </div>
                  </div>
                ) : null}
                {planned.status === "score-input-required" ? (
                  <StatusNotice tone="warning">{t.scoreAverageRequired}</StatusNotice>
                ) : planned.status === "invalid" ? (
                  <StatusNotice tone="danger">{t.invalid}</StatusNotice>
                ) : planned.status === "available" ? (
                  stepRows.length > 0 ? (
                    <ol className="@container flex flex-col rounded-lg bg-v2-surface px-4 py-0.5">
                      {stepRows.map((row, index) => (
                        <StepItem
                          key={row.key}
                          index={index}
                          row={row}
                          config={config}
                          title={stepTitle(row, goals)}
                          note={stepNote(row, {
                            equipmentName: nameOf(roles.equipmentUid, t.equipmentCurrency),
                            equipmentRequired,
                            targetEquipmentTier: goals.targetEquipmentTier,
                            studentRequired: studentUid && goals.targetTier != null ? studentRequired : null,
                          })}
                          nameOf={(uid) => nameOf(uid, t.otherReward)}
                        />
                      ))}
                    </ol>
                  ) : noGoals ? null : (
                    <p className="rounded-lg bg-v2-surface p-4 text-sm text-v2-fg-secondary">{t.noSteps}</p>
                  )
                ) : null}
              </ShopSection>

              <ReferenceSection
                config={config}
                roles={roles}
                studentUid={studentUid}
                nameOf={nameOf}
                currentScore={progress.cumulativeScore}
                targetScore={goals.targetScore}
              />
              {stacked && !plan.signedIn ? <ShopSignInNote /> : null}
            </>
          )}
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet panelId="janken-summary" title={t.summary} Icon={FlagIcon} defaultExpanded>
          {summary}
        </PanelSheet>
        {stacked || plan.signedIn ? null : <ShopSignInNote />}
      </PageAside>
      {stacked ? (
        <MobileActionBar
          leading={
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sheetPanelId === "janken-summary"}
              aria-label={t.openSummary}
              onClick={() => openSheet("janken-summary")}
              className={cn(
                "flex w-full items-center gap-3 rounded-[14px] bg-v2-elevated px-3.5 py-3 text-left shadow-lg",
                v2FocusRing,
              )}
            >
              {entryUid ? <CurrencyIcon uid={entryUid} name={entryName} size="lg" /> : null}
              <span className="min-w-0 grow">
                <span className="block text-lg leading-[1.2] font-bold tabular-nums">{entryCostText}</span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-xs",
                    missingAverageScore ? "text-v2-warning" : "text-v2-fg-tertiary",
                  )}
                >
                  {missingAverageScore ? t.scoreAverageSummary : t.mobileBarCaption(apText)}
                </span>
              </span>
              <ChevronUpIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            </button>
          }
        />
      ) : null}
    </>
  );
}

function summaryRows(config: AvailableConfig, rows: StepRow[]) {
  const result: { label: string; cost: number }[] = [];
  const byStage = new Map<string, { plays: number; cost: number }>();
  for (const row of rows) {
    if (row.kind === "prerequisite") {
      result.push({ label: t.firstClearSummary(row.stageUids.length), cost: row.cost });
      continue;
    }
    const uid = row.stageUids[0] ?? "";
    const previous = byStage.get(uid) ?? { plays: 0, cost: 0 };
    byStage.set(uid, { plays: previous.plays + row.plays, cost: previous.cost + row.cost });
  }
  for (const [uid, { plays, cost }] of byStage) {
    result.push({ label: t.stagePlaysSummary(stageLabel(config, uid), plays), cost });
  }
  return result;
}

function stepTitle(row: StepRow, goals: JankenPlannerEntry["goals"]) {
  if (row.kind === "prerequisite") return t.prerequisiteStep;
  if (row.kind === "equipment" && goals.targetEquipmentTier != null) return t.equipmentStep(goals.targetEquipmentTier);
  if (row.kind === "score" && goals.targetScore != null) return t.scoreStep(goals.targetScore);
  return t.remainingStep;
}

function stepNote(
  row: StepRow,
  context: {
    equipmentName: string;
    equipmentRequired: number;
    targetEquipmentTier: number | null;
    studentRequired: number | null;
  },
) {
  if (row.kind === "prerequisite") return t.prerequisiteNote;
  if (row.kind === "equipment" && context.targetEquipmentTier != null) {
    return t.equipmentStepResult(
      context.equipmentName,
      row.equipmentHave,
      context.equipmentRequired,
      context.targetEquipmentTier,
    );
  }
  if (row.kind === "score") return row.scoreGain > 0 ? t.scoreResult(row.scoreGain) : null;
  if (context.studentRequired != null) return t.studentStepResult(row.studentHave, context.studentRequired);
  return null;
}

function StepItem({
  index,
  row,
  config,
  title,
  note,
  nameOf,
}: {
  index: number;
  row: StepRow;
  config: AvailableConfig;
  title: string;
  note: string | null;
  nameOf: (uid: string) => string;
}) {
  const runs = row.multiplier ? multiplierRuns(row.plays, config.multipleMax) : [];
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3 py-3.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-v2-inset text-xs font-bold tabular-nums">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[0.8125rem] font-semibold">{title}</span>
            <span className="flex basis-full flex-wrap items-center gap-1 @min-[36rem]:basis-auto">
              {row.kind === "prerequisite"
                ? row.stageUids.map((uid, position) => (
                    <span key={uid} className="inline-flex items-center gap-1">
                      {position > 0 ? (
                        <ChevronRightIcon className="size-3 text-v2-fg-tertiary" aria-hidden="true" />
                      ) : null}
                      <Pill tone="neutral" className="h-5">
                        {stageLabel(config, uid)}
                      </Pill>
                    </span>
                  ))
                : row.stageUids.map((uid) => (
                    <Pill key={uid} tone="neutral" className="h-5">
                      {t.stagePlaysPill(stageLabel(config, uid), row.plays)}
                    </Pill>
                  ))}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold tabular-nums">
            <CurrencyIcon uid={row.entryUid} name={nameOf(row.entryUid)} size="sm" />
            {row.cost.toLocaleString()}
          </span>
        </div>
        {note || row.rewards.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {note ? (
              <span className="basis-full text-xs text-v2-fg-tertiary @min-[36rem]:basis-auto">{note}</span>
            ) : null}
            {row.rewards.map(({ uid, quantity }) => (
              <span key={uid} className="inline-flex items-center gap-1 text-xs tabular-nums text-v2-fg-secondary">
                <CurrencyIcon uid={uid} name={nameOf(uid)} size="sm" />
                {formatExpected(quantity)}
              </span>
            ))}
          </div>
        ) : null}
        {runs.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {runs.map(({ multiplier, count }) => (
              <span
                key={multiplier}
                className="inline-flex h-5 items-center rounded bg-v2-accent-subtle px-1.5 text-[0.6875rem] font-bold text-v2-accent"
              >
                {t.multiplierBadge(multiplier, count)}
              </span>
            ))}
            <span className="text-xs text-v2-fg-tertiary">{t.multiplierNote}</span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

// A goal card: thumbnail, name, optional subline, and the status on the right.
function GoalCard({
  region,
  icon,
  name,
  subline,
  status,
  children,
}: {
  region: string;
  icon: ReactNode;
  name: string;
  subline?: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <article data-region={region} className="@container flex min-w-0 flex-col gap-2 rounded-lg bg-v2-surface p-3.5">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <div className="min-w-0">
            <h3 className="text-[0.8125rem] font-semibold">{name}</h3>
            {subline ? <p className="mt-0.5 text-xs text-v2-fg-tertiary">{subline}</p> : null}
          </div>
        </div>
        {status}
      </header>
      <div className="mt-1 flex flex-col gap-1.5">{children}</div>
    </article>
  );
}

function GoalStatus({ tone, children }: { tone: "danger" | "success" | "warning" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 text-[0.8125rem] whitespace-nowrap tabular-nums",
        tone === "danger" && "font-semibold text-v2-danger",
        tone === "success" && "font-semibold text-v2-success",
        tone === "warning" && "font-semibold text-v2-warning",
        tone === "muted" && "text-v2-fg-tertiary",
      )}
    >
      {children}
    </span>
  );
}

// Label beside the control; tier pickers on a narrow card put the label above instead.
function GoalRow({
  label,
  htmlFor,
  stackOnNarrow = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  stackOnNarrow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-8 gap-3",
        stackOnNarrow
          ? "flex-col gap-1.5 @min-[22rem]:flex-row @min-[22rem]:items-start @min-[22rem]:gap-3"
          : "items-center",
      )}
    >
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className={cn(
            "w-16 shrink-0 text-xs text-v2-fg-tertiary",
            stackOnNarrow && "@min-[22rem]:leading-[2.125rem]",
          )}
        >
          {label}
        </label>
      ) : (
        <span
          className={cn(
            "w-16 shrink-0 text-xs text-v2-fg-tertiary",
            stackOnNarrow && "@min-[22rem]:leading-[2.125rem]",
          )}
        >
          {label}
        </span>
      )}
      <div className="flex min-w-0 grow flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

// A whole-number field with thousands separators. Empty input clears the value when `nullable`.
function CountInput({
  id,
  label,
  value,
  onChange,
  className,
  placeholder,
  invalid = false,
  nullable = false,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
  placeholder?: string;
  invalid?: boolean;
  nullable?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : value.toLocaleString());
  return (
    <input
      id={id}
      aria-label={label}
      aria-invalid={invalid || undefined}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={shown}
      onFocus={() => setDraft(value == null ? "" : String(value))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const digits = event.currentTarget.value.replace(/\D/g, "");
        setDraft(digits);
        onChange(digits ? Number(digits) : nullable ? null : 0);
      }}
      className={cn(
        "h-7 rounded-md border border-v2-control-border bg-v2-surface px-2 text-right text-sm font-semibold text-v2-fg tabular-nums placeholder:font-medium placeholder:text-v2-fg-disabled focus:border-v2-control-border-strong",
        invalid && "border-v2-control-border-strong ring-2 ring-v2-accent ring-offset-2 ring-offset-v2-canvas",
        v2FocusRing,
        className,
      )}
    />
  );
}

function TierMark({ tier }: { tier: number }) {
  return tier <= 5 ? (
    <>
      <span className="text-v2-warning" aria-hidden="true">
        ★
      </span>
      {tier}
    </>
  ) : (
    <>
      <img src="/icons/exclusive_weapon.png" alt="" className="mr-0.5 block w-4" />
      {tier - 5}
    </>
  );
}

// Tiers as fixed-width chips: stars on the first line, unique weapon tiers on the second.
function TierPicker({
  label,
  tiers,
  value,
  onChange,
  withNone = false,
  isDisabled,
  disabled = false,
}: {
  label: string;
  tiers: number[];
  value: number | null;
  onChange: (tier: number | null) => void;
  withNone?: boolean;
  isDisabled?: (tier: number) => boolean;
  disabled?: boolean;
}) {
  const chip = (key: string, selected: boolean, content: ReactNode, onClick: () => void, off = false, none = false) => (
    <button
      key={key}
      type="button"
      aria-label={none ? undefined : t.tierLabel(Number(key))}
      aria-pressed={selected}
      disabled={disabled || off}
      onClick={onClick}
      className={cn(
        "flex h-[2.125rem] w-[2.875rem] shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-lg bg-v2-inset text-[0.8125rem] font-bold whitespace-nowrap text-v2-fg disabled:cursor-default",
        none && "font-medium text-v2-fg-secondary",
        selected && "bg-v2-accent-subtle text-v2-accent ring-2 ring-v2-accent ring-inset",
        off && !selected && "opacity-40",
        v2FocusRing,
      )}
    >
      {content}
    </button>
  );
  const stars = tiers.filter((tier) => tier <= 5);
  const weapons = tiers.filter((tier) => tier > 5);
  return (
    <fieldset aria-label={label} className={cn("m-0 flex flex-col gap-1.5 border-0 p-0", disabled && "opacity-55")}>
      <div className="flex gap-1.5">
        {withNone ? chip("none", value === null, t.noGoal, () => onChange(null), false, true) : null}
        {stars.map((tier) =>
          chip(
            String(tier),
            value === tier,
            <TierMark tier={tier} />,
            () => onChange(withNone && value === tier ? null : tier),
            isDisabled?.(tier),
          ),
        )}
      </div>
      <div className="flex gap-1.5">
        {weapons.map((tier) =>
          chip(
            String(tier),
            value === tier,
            <TierMark tier={tier} />,
            () => onChange(withNone && value === tier ? null : tier),
            isDisabled?.(tier),
          ),
        )}
      </div>
    </fieldset>
  );
}

function StudentGoalCard({
  uid,
  name,
  currentTier,
  targetTier,
  held,
  shortfall,
  onHeldChange,
  onCurrentTierChange,
  onTargetTierChange,
}: {
  uid: string;
  name: string;
  currentTier: number;
  targetTier: number | null;
  held: number;
  shortfall: number;
  onHeldChange: (value: number) => void;
  onCurrentTierChange: (tier: number) => void;
  onTargetTierChange: (tier: number | null) => void;
}) {
  return (
    <GoalCard
      region="goal-eleph"
      icon={<ResourceThumb itemUid={uid} name={name} size="sm" />}
      name={name}
      status={
        targetTier == null ? null : shortfall > 0 ? (
          <GoalStatus tone="danger">{t.shortfall(shortfall)}</GoalStatus>
        ) : (
          <GoalStatus tone="success">{t.reached}</GoalStatus>
        )
      }
    >
      <div className="flex flex-col gap-2.5">
        <GoalRow label={t.heldQuantity} htmlFor="janken-held-student" stackOnNarrow>
          <CountInput
            id="janken-held-student"
            label={`${name} ${t.heldQuantity}`}
            value={held}
            onChange={(value) => onHeldChange(value ?? 0)}
            className="w-24"
          />
        </GoalRow>
        <GoalRow label={t.currentTier} stackOnNarrow>
          <TierPicker
            label={t.currentTier}
            tiers={STUDENT_TIERS}
            value={currentTier}
            onChange={(tier) => tier != null && onCurrentTierChange(tier)}
          />
        </GoalRow>
        <GoalRow label={t.targetTier} stackOnNarrow>
          <TierPicker
            label={t.targetTier}
            tiers={STUDENT_TARGET_TIERS}
            value={targetTier}
            withNone
            isDisabled={(tier) => tier <= currentTier && targetTier !== tier}
            onChange={onTargetTierChange}
          />
        </GoalRow>
      </div>
    </GoalCard>
  );
}

function UnknownStudentCard({ targetTier }: { targetTier: number | null }) {
  return (
    <GoalCard
      region="goal-no-student"
      icon={<span className="size-6 shrink-0 rounded-[5px] bg-v2-inset" aria-hidden="true" />}
      name={t.studentUnknownName}
      subline={t.studentUnknownHint}
      status={<GoalStatus tone="muted">{t.notCalculated}</GoalStatus>}
    >
      <GoalRow label={t.targetTier} stackOnNarrow>
        <TierPicker
          label={t.targetTier}
          tiers={STUDENT_TARGET_TIERS}
          value={targetTier}
          withNone
          disabled
          onChange={() => {}}
        />
      </GoalRow>
    </GoalCard>
  );
}

function EquipmentGoalCard({
  config,
  name,
  currentTier,
  targetTier,
  held,
  shortfall,
  onHeldChange,
  onCurrentTierChange,
  onTargetTierChange,
}: {
  config: AvailableConfig;
  name: string;
  currentTier: number;
  targetTier: number | null;
  held: number;
  shortfall: number;
  onHeldChange: (value: number) => void;
  onCurrentTierChange: (tier: number) => void;
  onTargetTierChange: (tier: number | null) => void;
}) {
  const costUid = config.equipmentUpgrade.costResource?.resourceUid;
  const tiers = Array.from({ length: config.equipmentUpgrade.maxTier }, (_, index) => index + 1);
  const targetTiers = tiers.filter((tier) => tier > currentTier || tier === targetTier);
  return (
    <GoalCard
      region="goal-equip"
      icon={
        costUid ? (
          <ResourceThumb itemUid={costUid} name={name} size="sm" />
        ) : (
          <span className="size-6 shrink-0 rounded-[5px] bg-v2-inset" aria-hidden="true" />
        )
      }
      name={name}
      subline={t.equipmentGoalHint(config.equipments.length)}
      status={
        targetTier == null ? null : shortfall > 0 ? (
          <GoalStatus tone="danger">{t.shortfall(shortfall)}</GoalStatus>
        ) : (
          <GoalStatus tone="success">{t.reached}</GoalStatus>
        )
      }
    >
      <GoalRow label={t.heldQuantity} htmlFor="janken-held-equipment-currency">
        <CountInput
          id="janken-held-equipment-currency"
          label={t.heldEquipmentCurrency}
          value={held}
          onChange={(value) => onHeldChange(value ?? 0)}
          className="w-24"
        />
      </GoalRow>
      <GoalRow label={t.currentEquipmentTierShort}>
        <Select
          label={t.currentEquipmentTier}
          value={String(currentTier)}
          options={tiers.map((tier) => ({ value: String(tier), label: `T${tier}` }))}
          onChange={(value) => onCurrentTierChange(Number(value))}
          className="[&_select]:min-w-0"
        />
      </GoalRow>
      <GoalRow label={t.targetEquipmentTierShort}>
        <Select
          label={t.equipmentGoal}
          value={targetTier == null ? "none" : String(targetTier)}
          options={[
            { value: "none", label: t.noGoal },
            ...targetTiers.map((tier) => ({ value: String(tier), label: `T${tier}` })),
          ]}
          onChange={(value) => onTargetTierChange(value === "none" ? null : Number(value))}
          className="[&_select]:min-w-0"
        />
      </GoalRow>
    </GoalCard>
  );
}

function ScoreGoalCard({
  config,
  iconUid,
  current,
  targetScore,
  averageScore,
  missingAverage,
  onCurrentChange,
  onTargetChange,
  onAverageChange,
}: {
  config: AvailableConfig;
  iconUid: string | null;
  current: number;
  targetScore: number | null;
  averageScore: number | null;
  missingAverage: boolean;
  onCurrentChange: (value: number) => void;
  onTargetChange: (value: number | null) => void;
  onAverageChange: (value: number | null) => void;
}) {
  const remaining = targetScore == null ? 0 : Math.max(0, targetScore - current);
  return (
    <GoalCard
      region="goal-score"
      icon={
        iconUid ? (
          <ResourceThumb itemUid={iconUid} name="" size="sm" />
        ) : (
          <span className="size-6 shrink-0 rounded-[5px] bg-v2-inset" aria-hidden="true" />
        )
      }
      name={t.scoreGoal}
      status={
        targetScore == null ? null : missingAverage ? (
          <GoalStatus tone="warning">{t.scoreAverageNeeded}</GoalStatus>
        ) : remaining > 0 ? (
          <GoalStatus tone="danger">{t.scoreShortfall(remaining)}</GoalStatus>
        ) : (
          <GoalStatus tone="success">{t.reached}</GoalStatus>
        )
      }
    >
      <GoalRow label={t.current} htmlFor="janken-current-score">
        <CountInput
          id="janken-current-score"
          label={`${t.current} ${t.scoreGoal}`}
          value={current}
          onChange={(value) => onCurrentChange(value ?? 0)}
          className="w-30"
        />
      </GoalRow>
      <GoalRow label={t.goal}>
        <Select
          label={t.targetScore}
          value={targetScore == null ? "none" : String(targetScore)}
          options={scoreTargetOptions(config, targetScore)}
          onChange={(value) => onTargetChange(value === "none" ? null : Number(value))}
        />
        {targetScore != null ? (
          <>
            <label htmlFor="janken-average-score" className="text-xs text-v2-fg-tertiary">
              {t.averageScoreShort}
            </label>
            <CountInput
              id="janken-average-score"
              label={t.averageScore}
              value={averageScore}
              nullable
              invalid={missingAverage}
              placeholder={t.averageInputPlaceholder}
              onChange={(value) => onAverageChange(value && value > 0 ? value : null)}
              className="w-26"
            />
          </>
        ) : null}
      </GoalRow>
    </GoalCard>
  );
}

function ShopCurrencyGoalCard({
  uid,
  name,
  mode,
  manual,
  linkedShortfall,
  owned,
  onModeChange,
  onManualChange,
  onOwnedChange,
}: {
  uid: string;
  name: string;
  mode: "linked" | "manual";
  manual: number;
  linkedShortfall: number;
  owned: number;
  onModeChange: (mode: "linked" | "manual") => void;
  onManualChange: (value: number) => void;
  onOwnedChange: (value: number) => void;
}) {
  const shortfall = Math.ceil(mode === "linked" ? linkedShortfall : manual);
  return (
    <GoalCard
      region="goal-shop-currency"
      icon={<ResourceThumb itemUid={uid} name={name} size="sm" />}
      name={name}
      subline={t.shopCurrencySubtitle}
      status={
        shortfall > 0 ? (
          <GoalStatus tone="danger">{t.shortfall(shortfall)}</GoalStatus>
        ) : (
          <GoalStatus tone="success">{t.enough}</GoalStatus>
        )
      }
    >
      <GoalRow label={t.required}>
        <Segmented
          label={t.manualShopCurrency}
          value={mode}
          options={[
            { value: "linked", label: t.shopLinked },
            { value: "manual", label: t.shopManual },
          ]}
          onChange={onModeChange}
        />
        {mode === "manual" ? (
          <CountInput
            id="janken-manual-shop-currency"
            label={t.manualShopCurrency}
            value={manual}
            onChange={(value) => onManualChange(value ?? 0)}
            className="w-24"
          />
        ) : null}
      </GoalRow>
      <GoalRow label={t.owned} htmlFor="janken-shop-currency-owned">
        <CountInput
          id="janken-shop-currency-owned"
          label={`${name} ${t.owned}`}
          value={owned}
          onChange={(value) => onOwnedChange(value ?? 0)}
          className="w-[4.5rem]"
        />
      </GoalRow>
    </GoalCard>
  );
}

function ClearedStagesSection({
  config,
  cleared,
  onChange,
}: {
  config: AvailableConfig;
  cleared: string[];
  onChange: (cleared: string[]) => void;
}) {
  const groups = (["story", "normal", "challenge"] as const)
    .map((type) => ({ type, stages: config.stages.filter(({ stageType }) => stageType === type) }))
    .filter(({ stages }) => stages.length > 0);
  return (
    <ShopSection id="janken-cleared-title" region="cleared">
      <ShopSectionHeader id="janken-cleared-title" title={t.clearedStages} />
      <div className="flex flex-col gap-2">
        {groups.map(({ type, stages }) => (
          <div key={type} className="flex items-center gap-3">
            <span className="w-13 shrink-0 text-xs text-v2-fg-tertiary">{t.stageGroups[type]}</span>
            <div className="flex flex-wrap gap-1">
              {stages.map((stage) => {
                const label = stageLabel(config, stage.uid);
                const done = cleared.includes(stage.uid);
                return (
                  <button
                    key={stage.uid}
                    type="button"
                    aria-pressed={done}
                    aria-label={t.stageCleared(label)}
                    onClick={() =>
                      onChange(done ? cleared.filter((uid) => uid !== stage.uid) : [...cleared, stage.uid])
                    }
                    className={cn(
                      "inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
                      done
                        ? "bg-v2-success-subtle text-v2-success"
                        : "bg-v2-inset text-v2-fg-secondary hover:text-v2-fg",
                      v2FocusRing,
                    )}
                  >
                    {done ? <CheckIcon className="size-3" aria-hidden="true" /> : null}
                    {stage.stageType === "challenge" ? t.challengeStage : stage.stageNumber}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ShopSection>
  );
}

function ReferenceSection({
  config,
  roles,
  studentUid,
  nameOf,
  currentScore,
  targetScore,
}: {
  config: AvailableConfig;
  roles: JankenResourceRoles;
  studentUid: string | null;
  nameOf: (uid: string | null | undefined, fallback: string) => string;
  currentScore: number;
  targetScore: number | null;
}) {
  const { stacked } = useV2Page();
  const [open, setOpen] = useState(false);
  // Stacked layouts lead with the score rewards; a tab the user picks wins on either layout.
  const [selectedTab, setTab] = useState<string | null>(null);
  const tab = selectedTab ?? (stacked ? "score" : "eff");
  const [showAllScoreRewards, setShowAllScoreRewards] = useState(false);
  const equipmentCostUid = config.equipmentUpgrade.costResource?.resourceUid ?? null;
  const farmStages = config.stages.filter(({ stageType }) => stageType === "normal" || stageType === "challenge");
  const columns = [
    { uid: studentUid, label: studentUid ? t.studentUnknownName : t.studentGrowth, digits: 2 },
    { uid: roles.shopUid, label: nameOf(roles.shopUid, t.shopCurrency), digits: 2 },
    { uid: equipmentCostUid, label: nameOf(equipmentCostUid, t.equipmentCurrency), digits: 0 },
  ];
  const perThousand = (stage: AvailableConfig["stages"][number], uid: string | null) => {
    if (!uid || stage.entryCost.quantity <= 0) return 0;
    const amount = stage.rewards
      .filter((reward) => reward.tag === "default" && reward.resourceUid === uid)
      .reduce((sum, reward) => sum + reward.quantity * reward.probability, 0);
    return (amount * 1000) / stage.entryCost.quantity;
  };
  const best = columns.map(({ uid }) => Math.max(0, ...farmStages.map((stage) => perThousand(stage, uid))));
  const visibleScoreRewards = showAllScoreRewards
    ? config.scoreRewards
    : getJankenScoreRewardWindow(config.scoreRewards, currentScore, targetScore);

  return (
    <section data-region="janken-reference" aria-labelledby="janken-reference-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <h2 id="janken-reference-title" className="text-[0.8125rem] font-semibold">
            {t.references}
          </h2>
          <p className="mt-0.5 text-xs text-v2-fg-tertiary">{t.referencesDescription}</p>
        </div>
        <Button
          variant="text"
          size="sm"
          aria-expanded={open}
          aria-controls="janken-reference-body"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t.collapse : t.expand}
          <ChevronDownIcon
            className={cn("size-3.5 transition-transform duration-v2-base", open && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </div>
      {open ? (
        <div id="janken-reference-body" className="flex flex-col gap-3">
          <SectionTabs
            label={t.references}
            selectedId={tab}
            onChange={setTab}
            items={[
              { id: "eff", label: t.efficiencyTab },
              { id: "score", label: t.scoreRewardsTab },
              { id: "equipment", label: t.equipmentTab },
            ]}
          />
          {tab === "eff" ? (
            <div className="overflow-x-auto rounded-lg bg-v2-surface p-4">
              <table className="w-full min-w-[28rem] border-collapse tabular-nums">
                <thead>
                  <tr className="text-xs text-v2-fg-tertiary">
                    <th className="h-10 pr-3 text-left font-normal">{t.stageColumn}</th>
                    <th className="h-10 px-3 text-right font-normal">{t.entryCostColumn}</th>
                    {columns.map(({ label }) => (
                      <th key={label} className="h-10 px-3 text-right font-normal whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {farmStages.map((stage) => (
                    <tr key={stage.uid}>
                      <th className="h-10 pr-3 text-left text-[0.8125rem] font-normal">
                        {stageLabel(config, stage.uid)}
                      </th>
                      <td className="h-10 px-3 text-right text-v2-fg-tertiary">{stage.entryCost.quantity}</td>
                      {columns.map(({ uid, label, digits }, index) => {
                        const value = perThousand(stage, uid);
                        const isBest = value > 0 && value === best[index];
                        return (
                          <td
                            key={label}
                            className={cn(
                              "h-10 px-3 text-right",
                              isBest ? "font-bold text-v2-fg" : "text-v2-fg-tertiary",
                            )}
                          >
                            {value === 0 ? "—" : value.toFixed(digits)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-v2-fg-tertiary">{t.efficiencyHelp}</p>
            </div>
          ) : null}
          {tab === "score" ? (
            <div className="flex flex-col gap-2">
              <div className="rounded-lg bg-v2-surface py-1">
                {visibleScoreRewards.map((reward) => (
                  <div
                    key={reward.tier}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                      reward.score <= currentScore
                        ? "text-v2-fg-tertiary"
                        : targetScore === reward.score && "bg-v2-link-subtle",
                    )}
                  >
                    <span>
                      {t.scoreTierLabel(reward.tier, reward.score)}
                      {targetScore === reward.score ? (
                        <span className="ml-2 text-xs text-v2-link">{t.targetTag}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap justify-end gap-2">
                      {reward.rewards.map((item) => (
                        <span key={item.resourceUid} className="inline-flex items-center gap-1 tabular-nums">
                          <CurrencyIcon
                            uid={item.resourceUid}
                            type={item.resourceType}
                            name={nameOf(item.resourceUid, t.otherReward)}
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
                <Button variant="text" size="sm" onClick={() => setShowAllScoreRewards((shown) => !shown)}>
                  {showAllScoreRewards ? t.collapse : t.showAll}
                </Button>
              ) : null}
              <p className="text-xs text-v2-fg-tertiary">{t.scoreClaimedHelp}</p>
            </div>
          ) : null}
          {tab === "equipment" ? (
            <div className="rounded-lg bg-v2-surface py-1">
              {config.equipmentUpgrade.tierCosts.map(({ tier, quantity }) => (
                <div key={tier} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {equipmentCostUid ? (
                    <CurrencyIcon
                      uid={equipmentCostUid}
                      name={nameOf(equipmentCostUid, t.equipmentCurrency)}
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
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// A newer plan saved elsewhere. The dialog asks which one to keep; dismissing it leaves the choice inline.
function ConflictPrompt({ persistence }: { persistence: EventShopPlanContext["jankenPersistence"] }) {
  const [dismissed, setDismissed] = useState(false);
  if (!persistence.isConflict) return null;
  const actions = (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={persistence.overwrite}>
        {t.overwriteHere}
      </Button>
      <Button variant="primary" onClick={persistence.reloadLatest}>
        {t.reloadNewer}
      </Button>
    </div>
  );
  return (
    <>
      {dismissed ? (
        <StatusNotice tone="danger" action={actions}>
          {persistence.conflictError ?? t.conflictTitle}
        </StatusNotice>
      ) : null}
      <Dialog open={!dismissed} onClose={() => setDismissed(true)} title={t.conflictTitle} size="sm">
        <p className="text-sm text-v2-fg-tertiary">{persistence.conflictError ?? t.conflictBody}</p>
        {actions}
      </Dialog>
    </>
  );
}
