import { ExclamationTriangleIcon, LockClosedIcon, PencilSquareIcon, SparklesIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useFetcher, useLocation, useNavigationType } from "react-router";
import { calculateStudentStats, getEquipmentMaxLevel, getEquipmentSlotUnlockLevel, renderStudentSkillDescriptionParts, resolveStudentCalculatorState, type StudentCalculatorCatalog, type StudentCalculatorSource, type StudentCalculatorState, selectStudentSkills } from "~/domain/student-calculator";
import { createStudentGrowthDraftStorageKey, parseStudentGrowthDraft, serializeStudentGrowthDraft } from "~/domain/student-growth-draft";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import { isStaleStudentStateActionResult, STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { StudentSkillSelectionCondition, type Attack, type StudentCatalogStat, type StudentSkillTypeEnum } from "~/graphql/graphql";
import { equipmentImageUrl } from "~/models/assets";
import type { PublicKnowledgeEntry } from "~/models/knowledge-entry";
import { Button } from "~/components/v2/primitives/Button";
import { RangeSlider } from "~/components/v2/primitives/RangeSlider";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import { StudentSkillIcon } from "~/components/v2/features/students/StudentSkillIcon";
import { StudentPreparingState } from "~/components/v2/features/students/StudentPreparingState";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import GrowthEditorSheet from "./GrowthEditorSheet";
import { KnowledgeAnnotatedDescription } from "./StudentKnowledgeAnnotations";

type StudentBasicInfoProps = {
  student: StudentCalculatorSource;
  schaleDbId: string | null;
  catalog: StudentCalculatorCatalog;
  signedIn: boolean;
  currentUserId: number | null;
  released: boolean;
  recruited: boolean;
  savedState: StudentCalculatorState;
  relatedRelationshipLevels: Record<string, number | null>;
  nullableSemantics: boolean;
  knowledgeEntries: PublicKnowledgeEntry[];
  knowledgeLookupStatus: "available" | "failed";
  aiSummary?: ReactNode;
  gradingSummary?: ReactNode;
};

type SaveResult = { ok: true } | { ok: false; error: string; code?: string; retryable?: boolean };
type StudentBasicInfoSavePayload = Record<string, number | null | string>;

const nullableCurrentStateFields = [
  "level", "skillEx", "skillNormal", "skillEnhanced", "skillSub", "equip1", "equip2", "equip3",
  "equip1Level", "equip2Level", "equip3Level", "equipSpecial", "weaponLevel", "abilityHp", "abilityAtk", "abilityHeal",
] as const satisfies (keyof StudentCalculatorState)[];

const skillSlotLabels: Record<StudentSkillTypeEnum, string> = {
  ex: "EX 스킬",
  public: "기본 스킬",
  passive: "강화 스킬",
  extra_passive: "서브 스킬",
};

const skillSelectionConditionLabels: Record<StudentSkillSelectionCondition, string> = {
  [StudentSkillSelectionCondition.Enemy]: "적에게 사용 시",
  [StudentSkillSelectionCondition.Self]: "자신에게 사용 시",
};

const primaryStats = [
  { stat: "MAX_HP" as StudentCatalogStat, label: "최대 체력" },
  { stat: "ATTACK_POWER" as StudentCatalogStat, label: "공격력" },
  { stat: "DEFENSE_POWER" as StudentCatalogStat, label: "방어력" },
  { stat: "HEAL_POWER" as StudentCatalogStat, label: "치유력" },
] as const;

export function normalizeNullableStudentBasicInfoField(
  field: (typeof nullableCurrentStateFields)[number],
  value: number | null,
): number | null {
  return field === "equipSpecial" && value === 0 ? null : value;
}

export function getSkillSelectionConditionLabel(condition: StudentSkillSelectionCondition): string {
  return skillSelectionConditionLabels[condition];
}

export function scrollToStudentBasicInfo() {
  document.getElementById("student-basic-info")?.scrollIntoView({ block: "start" });
}

export function getAbilityReleaseDisabledReason(tier: number, level = 90): string | null {
  if (tier <= 5) return "고유무기 1성부터 능력 개방을 설정할 수 있어요";
  if (level < 90) return "학생 레벨 90부터 능력 개방을 설정할 수 있어요";
  return null;
}

export default function StudentBasicInfo({
  student, catalog, signedIn, currentUserId, released, recruited, savedState,
  relatedRelationshipLevels, nullableSemantics, knowledgeEntries, knowledgeLookupStatus, aiSummary, gradingSummary,
}: StudentBasicInfoProps) {
  const fetcher = useFetcher<SaveResult>();
  const { hash } = useLocation();
  const navigationType = useNavigationType();
  const stateStudentUid = student.studentVariant.primaryStudent.uid;
  const [state, setState] = useState<StudentCalculatorState>(savedState);
  const [skillEffectsState, setSkillEffectsState] = useState({ studentUid: student.uid, enabled: false });
  const [growthSheetOpen, setGrowthSheetOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [staleWriteBlocked, setStaleWriteBlocked] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const staleWriteBlockedRef = useRef(false);
  const submittedPayloadRef = useRef<StudentBasicInfoSavePayload | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const draftStorageKey = useMemo(
    () => (currentUserId === null ? null : createStudentGrowthDraftStorageKey(currentUserId, stateStudentUid)),
    [currentUserId, stateStudentUid],
  );
  const resolved = useMemo(() => resolveStudentCalculatorState(student, state, catalog), [student, state, catalog]);
  const selectedGearTier = student.catalog?.gear?.tiers.find((tier) => tier.tier === resolved.equipSpecial);
  const relatedFavorStates = useMemo(
    () => student.character.studentVariants.flatMap((variant) => {
      const primary = variant.primaryStudent;
      if (primary.uid === stateStudentUid || !primary.catalog) return [];
      return [{ favorRewards: primary.catalog.favorRewards, bond: relatedRelationshipLevels[primary.uid] ?? null }];
    }),
    [student.character.studentVariants, stateStudentUid, relatedRelationshipLevels],
  );
  const includeSkillEffects = skillEffectsState.studentUid === student.uid && skillEffectsState.enabled;
  const stats = useMemo(
    () => calculateStudentStats(student, catalog, state, relatedFavorStates, includeSkillEffects),
    [student, catalog, state, relatedFavorStates, includeSkillEffects],
  );
  const selectedSkills = useMemo(() => selectStudentSkills(student, state), [student, state]);
  const statValues = useMemo(() => new Map(stats.map(({ stat, value }) => [stat, value])), [stats]);
  const primaryStatValues = primaryStats.flatMap(({ stat, label }) => {
    const value = statValues.get(stat);
    return value === undefined ? [] : [{ stat, label, value }];
  });
  const primaryStatsAvailable = primaryStatValues.length === primaryStats.length;
  const abilityReleaseDisabledReason = getAbilityReleaseDisabledReason(resolved.tier, resolved.level);
  const saveAvailable = signedIn && released;
  const saveDisabled = fetcher.state !== "idle" || (!recruited && !draftReady) || staleWriteBlocked;
  const saving = fetcher.state !== "idle";
  const saveLabel = "내 프로필에 반영";
  const saveError = staleWriteBlocked
    ? STUDENT_STATE_STALE_MESSAGE
    : fetcher.data && !fetcher.data.ok
      ? fetcher.data.error
      : null;

  useEffect(() => {
    if (hash !== "#student-basic-info" || navigationType !== "PUSH") return;
    const frameId = window.requestAnimationFrame(scrollToStudentBasicInfo);
    return () => window.cancelAnimationFrame(frameId);
  }, [hash, navigationType]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (isStaleStudentStateActionResult(fetcher.data)) {
      staleWriteBlockedRef.current = true;
      setStaleWriteBlocked(true);
      setSaved(false);
      setRetryAvailable(false);
      return;
    }
    setSaved(fetcher.data.ok);
    if (fetcher.data.ok) {
      if (submittedPayloadRef.current) {
        trackGoogleAnalyticsEvent("student_state_saved", { source: "manual", scope: "single" });
      }
      submittedPayloadRef.current = null;
      setRetryAvailable(false);
    } else {
      setRetryAvailable(fetcher.data.retryable === true);
    }
    if (fetcher.data.ok && draftStorageKey) {
      try { localStorage.removeItem(draftStorageKey); } catch { /* Server state remains authoritative. */ }
    }
  }, [draftStorageKey, fetcher.state, fetcher.data]);

  useEffect(() => {
    setDraftReady(false);
    setDraftStatus("idle");
    if (!draftStorageKey || recruited) {
      setDraftReady(true);
      return;
    }
    try {
      const serializedDraft = localStorage.getItem(draftStorageKey);
      const draft = serializedDraft ? parseStudentGrowthDraft(serializedDraft) : null;
      if (draft) {
        setState((current) => ({ ...current, ...draft }));
        setDraftStatus("saved");
      }
    } catch {
      setDraftStatus("error");
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey, recruited]);

  useEffect(() => {
    if (!draftReady || !draftStorageKey || released || recruited) return;
    setDraftStatus("saving");
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey, serializeStudentGrowthDraft(state));
        setDraftStatus("saved");
      } catch { setDraftStatus("error"); }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [draftReady, draftStorageKey, recruited, released, state]);

  const updateState = <K extends keyof StudentCalculatorState>(key: K, value: StudentCalculatorState[K]) => {
    setSaved(false);
    setState((current) => ({ ...current, [key]: value }));
  };
  const updateTier = (tier: number) => {
    const weaponLevelMax = getWeaponLevelMaxByTier(tier);
    setSaved(false);
    setState((current) => ({
      ...current,
      tier,
      weaponLevel: weaponLevelMax === 0 ? null : Math.min(current.weaponLevel ?? 1, weaponLevelMax),
      abilityHp: tier <= 5 ? null : current.abilityHp,
      abilityAtk: tier <= 5 ? null : current.abilityAtk,
      abilityHeal: tier <= 5 ? null : current.abilityHeal,
    }));
  };
  const submitSave = (payload: StudentBasicInfoSavePayload) => {
    if (staleWriteBlockedRef.current) return;
    submittedPayloadRef.current = payload;
    setRetryAvailable(false);
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  };
  const handleSave = () => {
    if (staleWriteBlockedRef.current) return;
    if (nullableSemantics) {
      const payload: StudentBasicInfoSavePayload = { stateFormat: "nullable" };
      if (!recruited || state.tier !== savedState.tier) payload.tier = resolved.tier;
      for (const field of nullableCurrentStateFields) {
        if (state[field] !== savedState[field]) payload[field] = normalizeNullableStudentBasicInfoField(field, state[field]);
      }
      if (state.bond !== savedState.bond) payload.bond = state.bond;
      if (recruited && Object.keys(payload).length === 1) return;
      submitSave(payload);
      return;
    }
    submitSave({
      tier: resolved.tier, bond: state.bond, level: state.level, skillEx: state.skillEx, skillNormal: state.skillNormal,
      skillEnhanced: state.skillEnhanced, skillSub: state.skillSub, equip1: state.equip1, equip2: state.equip2,
      equip3: state.equip3, equip1Level: resolved.equip1Level, equip2Level: resolved.equip2Level,
      equip3Level: resolved.equip3Level, equipSpecial: state.equipSpecial && state.equipSpecial > 0 ? state.equipSpecial : null,
      weaponLevel: state.weaponLevel, abilityHp: state.abilityHp, abilityAtk: state.abilityAtk, abilityHeal: state.abilityHeal,
    });
  };
  const handleRetry = () => {
    if (staleWriteBlockedRef.current || !retryAvailable || !submittedPayloadRef.current) return;
    submitSave(submittedPayloadRef.current);
  };
  const refresh = () => window.location.reload();

  return (
    <>
    <section id="student-basic-info" className="scroll-mt-4">
        <SectionHeading title="능력치">
          <Switch
            id="student-skill-effects"
            checked={includeSkillEffects}
            onCheckedChange={(enabled) => setSkillEffectsState({ studentUid: student.uid, enabled })}
            label="스킬 효과 반영"
            size="sm"
            layout="inline"
          />
        </SectionHeading>
        <div className="rounded-lg bg-v2-surface p-v2-block-p">
          {primaryStatsAvailable ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-[10px] sm:grid-cols-4 sm:gap-3">
              {primaryStatValues.map(({ stat, label, value }) => (
                <div key={stat} className="min-w-0">
                  <dt className="truncate text-xs leading-[1.43] text-v2-fg-tertiary">{label}</dt>
                  <dd className="truncate text-lg font-semibold leading-[1.4] text-v2-fg tabular-nums">
                    {value.toLocaleString("ko-KR")}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <StudentPreparingState compact />
          )}
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-v2-divider pt-3">
            <GrowthSummaryRow growth={resolved} abilityReleaseDisabledReason={abilityReleaseDisabledReason} />
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {saved && !growthSheetOpen ? <span className="text-xs leading-[1.43] font-medium text-v2-success">반영됨</span> : null}
              <Button size="sm" onClick={() => setGrowthSheetOpen(true)}>
                <PencilSquareIcon className="size-4" aria-hidden="true" />성장도 편집
              </Button>
              {saveAvailable ? (
                <Button size="sm" variant="primary" disabled={saveDisabled} onClick={handleSave}>
                  {saving ? "반영 중" : saveLabel}
                </Button>
              ) : released && !signedIn ? (
                <span className="whitespace-nowrap text-xs leading-[1.43] text-v2-fg-tertiary">로그인 후 사용 가능</span>
              ) : null}
            </div>
          </div>
        </div>
        {saveError && !growthSheetOpen ? (
          <StatusNotice
            className="mt-[10px] [&>svg]:hidden"
            tone={staleWriteBlocked ? "warning" : "danger"}
            action={staleWriteBlocked ? <Button className="-my-1" size="sm" variant="text" onClick={refresh}><ArrowPathIcon className="size-3.5" aria-hidden="true" />새로고침</Button> : retryAvailable ? <Button className="-my-1" size="sm" variant="text" onClick={handleRetry}><ArrowPathIcon className="size-3.5" aria-hidden="true" />다시 시도</Button> : undefined}
          >
            <span className="relative block pl-6 leading-[1.43]">
              {staleWriteBlocked ? <ExclamationTriangleIcon className="absolute top-0.5 left-0 size-4 text-v2-warning" aria-hidden="true" /> : <XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />}
              {saveError}
            </span>
          </StatusNotice>
        ) : null}
        <GrowthEditorSheet
          open={growthSheetOpen}
          onClose={() => setGrowthSheetOpen(false)}
          initialTier={student.initialTier}
          growth={resolved}
          abilityReleaseDisabledReason={abilityReleaseDisabledReason}
          onTierChange={updateTier}
          onLevelChange={(value) => updateState("level", value)}
          onBondChange={(value) => updateState("bond", value)}
          onAbilityHpChange={(value) => updateState("abilityHp", value)}
          onAbilityAtkChange={(value) => updateState("abilityAtk", value)}
          onAbilityHealChange={(value) => updateState("abilityHeal", value)}
          saveAvailable={saveAvailable}
          signedIn={signedIn}
          released={released}
          saved={saved}
          saving={saving}
          saveDisabled={saveDisabled}
          saveLabel={saveLabel}
          saveError={saveError}
          staleWriteBlocked={staleWriteBlocked}
          retryAvailable={retryAvailable}
          onSave={handleSave}
          onRefresh={refresh}
          onRetry={handleRetry}
        />
      </section>

      {gradingSummary ? (
        <section className="mt-6">
          <SectionHeading title="학생 평가 요약">
            <Link to={`/students/${student.uid}/gradings`} className="inline-flex min-h-7 items-center rounded-md px-2 text-xs leading-[1.43] font-medium text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg">
              전체 평가 보기
            </Link>
          </SectionHeading>
          {gradingSummary}
          {aiSummary}
        </section>
      ) : null}

      {knowledgeLookupStatus === "failed" ? <StatusNotice className="mt-6 [&>div:first-of-type]:leading-[1.43]" tone="neutral">용어 설명을 불러오지 못했어요.</StatusNotice> : null}

      <section className="mt-6">
        <SectionHeading title="스킬" />
        <div className="overflow-hidden rounded-lg bg-v2-surface p-v2-block-p">
          {selectedSkills.length === 0 ? (
            <p className="text-sm leading-[1.43] text-v2-fg-secondary">현재 상태에 맞는 스킬 정보를 불러오지 못했어요</p>
          ) : (
            selectedSkills.map((skill, index) => (
              <SkillRow
                key={`${skill.slot}-${skill.position}-${skill.uid}`}
                skill={skill}
                allSkills={student.skills}
                entries={knowledgeEntries}
                attackType={student.attackType}
                last={index === selectedSkills.length - 1}
                onLevelChange={(value) => updateState(skillFieldForSlot(skill.slot), value)}
              />
            ))
          )}
        </div>
      </section>

      <div className="mt-6 grid items-stretch gap-y-6 md:grid-cols-2 md:gap-x-4">
        <section className="flex min-w-0 flex-col">
          <SectionHeading title="고유무기" />
                <div className="flex flex-1 items-center rounded-lg bg-v2-surface px-v2-block-p py-3">
            <div className="grid w-full grid-cols-[9.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 max-[767px]:grid-cols-[8.5rem_minmax(0,1fr)]">
              <div className="relative flex h-[4.75rem] min-h-0 min-w-0 items-center justify-center rounded-md bg-v2-inset max-[767px]:h-[4.25rem]">
                {student.catalog?.weapon.imageUrl ? <img src={student.catalog.weapon.imageUrl} alt={student.catalog.weapon.name} className="h-full w-full object-contain" /> : null}
                <span className="absolute right-2 bottom-1.5 inline-flex items-center gap-px" role="img" aria-label={`${resolved.weaponStar}성`}>
                  {/* biome-ignore lint/suspicious/noArrayIndexKey: decorative stars have no state and are added or removed as the weapon tier changes. */}
                  {Array.from({ length: Math.max(0, resolved.weaponStar) }, (_, index) => <StarIcon key={index} className="size-3.5 text-v2-perk" aria-hidden="true" />)}
                  {resolved.weaponStar === 0 ? <span className="text-xs leading-[1.43] text-v2-fg-secondary">미개방</span> : null}
                </span>
              </div>
              <div className="min-w-0">
                <strong className="mb-1 block truncate text-sm leading-[1.43] font-semibold text-v2-fg">{student.catalog?.weapon.name}</strong>
                <div className="w-[129px] max-w-full [&>label]:!gap-0 [&_label_span]:!leading-[1.43]">
                  <RangeSlider className="!w-full" layout="stacked" label="레벨" value={resolved.weaponLevel} min={resolved.weaponStar > 0 ? 1 : 0} max={getWeaponLevelMaxByTier(resolved.tier)} disabled={resolved.weaponStar === 0} disabledAppearance="track" onChange={(value) => updateState("weaponLevel", value)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionHeading title="장비" />
          <div className="grid flex-1 grid-cols-3 gap-y-3 gap-x-4 rounded-lg bg-v2-surface px-v2-block-p py-3 max-[767px]:gap-x-3">
            {student.equipments.map((category, index) => {
              const key = ["equip1", "equip2", "equip3"][index] as "equip1" | "equip2" | "equip3";
              const levelKey = `${key}Level` as "equip1Level" | "equip2Level" | "equip3Level";
              const availableEquipmentTiers = catalog.equipment.filter((equipment) => equipment.category === category);
              const maxTier = availableEquipmentTiers.length > 0 ? Math.max(...availableEquipmentTiers.map((equipment) => equipment.tier)) : null;
              const selectedEquipment = availableEquipmentTiers.find((equipment) => equipment.tier === resolved[key]);
              const equipmentLabel = EQUIPMENT_TYPE_LABELS[category] ?? "장비";
              const unlockLevel = getEquipmentSlotUnlockLevel(index);
              const locked = resolved.level < unlockLevel;
              return (
                <div key={key} className="flex min-w-0 flex-col gap-1">
                  <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-md bg-v2-inset">
                    {selectedEquipment ? <img src={equipmentImageUrl(selectedEquipment.uid)} alt={selectedEquipment.name} className={`size-10 -translate-y-1 object-contain ${locked ? "opacity-40" : ""}`} /> : null}
                    <span className="absolute bottom-1.5 left-2 text-xs leading-[1.43] text-v2-fg-secondary">{equipmentLabel}</span>
                  </div>
                  {locked ? (
                    <p className="flex min-h-12 items-start gap-1 pt-1 text-xs leading-[1.43] text-v2-fg-tertiary"><LockClosedIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>학생 Lv.{unlockLevel} 필요</span></p>
                  ) : selectedEquipment && maxTier !== null ? (
                  <div className="flex flex-col [&>label]:grid-cols-[auto_minmax(0,1fr)_20px] [&_label_span]:!leading-[1.43]">
                      <RangeSlider label="티어" accessibleLabel={`${equipmentLabel} 티어`} value={resolved[key]} min={1} max={maxTier} showValue onChange={(value) => {
                        const maxLevel = getEquipmentMaxLevel(catalog, category, value);
                        setSaved(false);
                        setState((current) => ({ ...current, [key]: value, [levelKey]: maxLevel }));
                      }} valueClassName="text-[13px]" />
                      <RangeSlider label="레벨" accessibleLabel={`${equipmentLabel} 레벨`} value={resolved[levelKey]} min={1} max={selectedEquipment.maxLevel} showValue onChange={(value) => updateState(levelKey, value)} valueClassName="text-[13px]" />
                    </div>
                  ) : (
                    <StudentPreparingState compact />
                  )}
                </div>
              );
            })}
            {student.catalog?.gear ? (
              <div className="col-span-3 flex items-center gap-2 border-t border-v2-divider pt-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-v2-inset"><SparklesIcon className="size-4 text-v2-fg-tertiary" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1 [&>label]:grid-cols-[auto_minmax(0,1fr)_20px] [&_label_span]:!leading-[1.43]">
                  <RangeSlider label={student.catalog.gear.name} value={resolved.equipSpecial} valuePrefix="T" min={0} max={2} showValue onChange={(value) => updateState("equipSpecial", value)} />
                  {selectedGearTier && resolved.bond < selectedGearTier.openFavorLevel ? (
                    <p className="mt-0.5 text-xs leading-[1.43] text-v2-fg-tertiary">인연 Lv.{selectedGearTier.openFavorLevel}부터 적용</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
      <h2 className="text-base leading-[1.4] font-semibold text-v2-fg" style={{ fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' }}>{title}</h2>
      {children}
    </div>
  );
}

export function GrowthSummaryRow({
  growth,
  abilityReleaseDisabledReason,
}: {
  growth: ReturnType<typeof resolveStudentCalculatorState>;
  abilityReleaseDisabledReason: string | null;
}) {
  return (
    <p className="flex min-w-0 flex-auto flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[13px] leading-[1.43] text-v2-fg-secondary tabular-nums">
      <span className="inline-flex items-center gap-[3px] whitespace-nowrap font-semibold text-v2-fg">{growth.tier <= 5 ? `★${growth.tier}` : <><img src="/icons/exclusive_weapon.png" alt="" className="size-3.5 shrink-0" />{growth.tier - 5}</>}</span>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">Lv. <strong className="font-semibold text-v2-fg">{growth.level}</strong></span>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">인연 <strong className="font-semibold text-v2-fg">{growth.bond}</strong></span>
      {abilityReleaseDisabledReason === null ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap">능력 개방 체력 <strong className="font-semibold text-v2-fg">{growth.abilityHp}</strong> · 공격력 <strong className="font-semibold text-v2-fg">{growth.abilityAtk}</strong> · 치유력 <strong className="font-semibold text-v2-fg">{growth.abilityHeal}</strong></span> : null}
    </p>
  );
}

function SkillRow({ skill, allSkills, entries, attackType, last, onLevelChange }: {
  skill: ReturnType<typeof selectStudentSkills>[number];
  allSkills: StudentCalculatorSource["skills"];
  entries: PublicKnowledgeEntry[];
  attackType: Attack;
  last: boolean;
  onLevelChange: (value: number) => void;
}) {
  const linkedSkills = [
    ...skill.additionalSkillUids.map((uid) => ({ uid, label: "추가" })),
    ...skill.selectableSkills.map(({ skillUid, condition }) => ({ uid: skillUid, label: skillSelectionConditionLabels[condition] })),
  ].flatMap(({ uid, label }) => {
    const linked = allSkills.find((candidate) => candidate.uid === uid);
    return linked ? [{ ...linked, label }] : [];
  });
  return (
    <div className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-[14px] gap-y-1 px-0 pt-[14px] pb-[15px] first:pt-0 last:pb-0 md:grid-cols-[2.5rem_minmax(0,1fr)_9.5rem]">
      <StudentSkillIcon attackType={attackType} iconUrl={skill.iconUrl} size="sm" />
      <div className="min-w-0">
        <span className="block text-xs leading-[1.43] text-v2-fg-tertiary">{skillSlotLabels[skill.slot]}</span>
        <SkillName
          name={skill.name}
          cost={exSkillCost(skill, skill.slot, skill.selectedLevel)}
          className="text-sm leading-[1.43] font-semibold text-v2-fg"
        />
        <SkillDescription skill={skill} entries={entries} />
        {linkedSkills.map((linked) => (
          <div key={linked.uid} className="mt-2 border-l-2 border-v2-divider pl-3">
            <span className="text-xs leading-[1.43] text-v2-fg-tertiary">{linked.label}</span>
            <SkillName
              name={linked.name}
              cost={exSkillCost(linked, skill.slot, skill.selectedLevel)}
              className="text-sm leading-[1.43] text-v2-fg"
            />
            <SkillDescription skill={{ ...linked, selectedLevel: skill.selectedLevel }} entries={entries} />
          </div>
        ))}
      </div>
      <div className="col-span-2 md:col-span-1 [&_label_span]:!leading-[1.43]">
        <RangeSlider layout="stacked" label="레벨" value={skill.selectedLevel} min={1} max={skill.maxLevel} onChange={onLevelChange} />
      </div>
      {!last ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-v2-divider" /> : null}
    </div>
  );
}

function exSkillCost(
  skill: Pick<StudentCalculatorSource["skills"][number], "levels">,
  slot: StudentSkillTypeEnum,
  level: number,
): number | null {
  if (slot !== "ex") return null;
  return skill.levels.find((candidate) => candidate.level === level)?.cost ?? null;
}

function SkillName({ name, cost, className }: { name: string; cost: number | null; className?: string }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <strong className={className}>{name}</strong>
      {cost !== null && (
        <span className="shrink-0 rounded-sm bg-v2-inset px-1 py-px text-[10px] leading-3.5 font-semibold text-v2-fg-tertiary">
          COST <span className="text-xs font-bold tabular-nums text-v2-fg">{cost}</span>
        </span>
      )}
    </div>
  );
}

function SkillDescription({ skill, entries }: { skill: Parameters<typeof renderStudentSkillDescriptionParts>[0]; entries: PublicKnowledgeEntry[] }) {
  const parts = renderStudentSkillDescriptionParts(skill);
  if (!parts) return null;
  return <p className="mt-1 whitespace-pre-line text-sm leading-[1.6] text-v2-fg-secondary"><KnowledgeAnnotatedDescription parts={parts} entries={entries} /></p>;
}

function skillFieldForSlot(slot: StudentSkillTypeEnum): "skillEx" | "skillNormal" | "skillEnhanced" | "skillSub" {
  if (slot === "ex") return "skillEx";
  if (slot === "public") return "skillNormal";
  if (slot === "passive") return "skillEnhanced";
  return "skillSub";
}
