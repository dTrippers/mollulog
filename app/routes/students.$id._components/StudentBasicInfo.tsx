import {
  ArrowTopRightOnSquareIcon,
  ArrowTrendingUpIcon,
  HeartIcon,
  SparklesIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher } from "react-router";
import { TierSelector } from "~/components/features/students";
import { Button, Callout, EmptyView, HoverTooltip, NumberInput, SectionCard, SubTitle } from "~/components/primitives";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import {
  calculateStudentStats,
  getEquipmentMaxLevel,
  getEquipmentSlotUnlockLevel,
  renderStudentSkillDescriptionParts,
  resolveStudentCalculatorState,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  type StudentCalculatorState,
  selectStudentSkills,
} from "~/domain/student-calculator";
import {
  createStudentGrowthDraftStorageKey,
  parseStudentGrowthDraft,
  serializeStudentGrowthDraft,
} from "~/domain/student-growth-draft";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import {
  type Attack,
  type StudentCatalogStat,
  StudentSkillSelectionCondition,
  type StudentSkillTypeEnum,
} from "~/graphql/graphql";
import { equipmentImageUrl } from "~/models/assets";

type StudentBasicInfoProps = {
  student: StudentCalculatorSource;
  schaleDbId: string | null;
  catalog: StudentCalculatorCatalog;
  signedIn: boolean;
  currentUserId: number | null;
  released: boolean;
  recruited: boolean;
  savedState: StudentCalculatorState;
  relatedRelationshipLevels: Record<string, number>;
  gradingSummary?: React.ReactNode;
};

type SaveResult = { ok: true } | { ok: false; error: string };

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

export function getSkillSelectionConditionLabel(condition: StudentSkillSelectionCondition): string {
  return skillSelectionConditionLabels[condition];
}

const skillIconColorClass: Record<Attack, string> = {
  explosive: "text-red-600",
  piercing: "text-yellow-500",
  mystic: "text-blue-600",
  sonic: "text-purple-600",
  chemical: "text-green-600",
  normal: "text-neutral-600",
};

const primaryStats = [
  { stat: "MAX_HP" as StudentCatalogStat, label: "최대 체력" },
  { stat: "ATTACK_POWER" as StudentCatalogStat, label: "공격력" },
  { stat: "DEFENSE_POWER" as StudentCatalogStat, label: "방어력" },
  { stat: "HEAL_POWER" as StudentCatalogStat, label: "치유력" },
] as const;

const weaponStars = [1, 2, 3, 4] as const;

export default function StudentBasicInfo({
  student,
  schaleDbId,
  catalog,
  signedIn,
  currentUserId,
  released,
  recruited,
  savedState,
  relatedRelationshipLevels,
  gradingSummary,
}: StudentBasicInfoProps) {
  const fetcher = useFetcher<SaveResult>();
  const stateStudentUid = student.studentVariant.primaryStudent.uid;
  const [state, setState] = useState<StudentCalculatorState>(savedState);
  const [saved, setSaved] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const draftStorageKey = useMemo(
    () => (currentUserId === null ? null : createStudentGrowthDraftStorageKey(currentUserId, stateStudentUid)),
    [currentUserId, stateStudentUid],
  );
  const resolved = useMemo(() => resolveStudentCalculatorState(student, state, catalog), [student, state, catalog]);
  const relatedFavorStates = useMemo(
    () =>
      student.character.studentVariants.flatMap((variant) => {
        const primary = variant.primaryStudent;
        if (primary.uid === stateStudentUid || !primary.catalog) return [];
        return [
          {
            favorRewards: primary.catalog.favorRewards,
            bond: relatedRelationshipLevels[primary.uid] ?? null,
          },
        ];
      }),
    [student.character.studentVariants, stateStudentUid, relatedRelationshipLevels],
  );
  const stats = useMemo(
    () => calculateStudentStats(student, catalog, state, relatedFavorStates),
    [student, catalog, state, relatedFavorStates],
  );
  const selectedSkills = useMemo(() => selectStudentSkills(student, state), [student, state]);
  const statValues = useMemo(() => new Map(stats.map(({ stat, value }) => [stat, value])), [stats]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    setSaved(fetcher.data.ok);
    if (fetcher.data.ok && draftStorageKey) {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // The server state remains authoritative even if browser storage cannot be cleared.
      }
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
      } catch {
        setDraftStatus("error");
      }
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

  const handleSave = () => {
    fetcher.submit(
      {
        tier: resolved.tier,
        bond: state.bond,
        level: state.level,
        skillEx: state.skillEx,
        skillNormal: state.skillNormal,
        skillEnhanced: state.skillEnhanced,
        skillSub: state.skillSub,
        equip1: state.equip1,
        equip2: state.equip2,
        equip3: state.equip3,
        equip1Level: resolved.equip1Level,
        equip2Level: resolved.equip2Level,
        equip3Level: resolved.equip3Level,
        equipSpecial: state.equipSpecial && state.equipSpecial > 0 ? state.equipSpecial : null,
        weaponLevel: state.weaponLevel,
        abilityHp: state.abilityHp,
        abilityAtk: state.abilityAtk,
        abilityHeal: state.abilityHeal,
      },
      { method: "post", encType: "application/json" },
    );
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <section>
        <h2 className="text-lg font-semibold">학생 기본 정보</h2>
        <SectionCard className="mt-3 space-y-0 p-2.5 md:mt-4 md:p-4">
          <div className="grid gap-2 md:grid-cols-2 md:items-start">
            <div className="grid gap-2">
              <BasicField title="레벨" icon={<ArrowTrendingUpIcon className="size-4" />}>
                <div className="ml-auto w-full max-w-56">
                  <NumberInput
                    fullWidth
                    size="sm"
                    minValue={1}
                    maxValue={90}
                    value={resolved.level}
                    showMax
                    controlClassName="border-0 bg-card shadow-sm"
                    onChange={(value) => updateState("level", value)}
                  />
                </div>
              </BasicField>

              <BasicField title="인연 랭크" icon={<HeartIcon className="size-4" />}>
                <div className="ml-auto w-full max-w-56">
                  <NumberInput
                    fullWidth
                    size="sm"
                    minValue={1}
                    maxValue={100}
                    value={resolved.bond}
                    showMax
                    controlClassName="border-0 bg-card shadow-sm"
                    onChange={(value) => updateState("bond", value)}
                  />
                </div>
              </BasicField>

              <BasicField title="신비 해방" icon={<StarIcon className="size-4" />}>
                <div className="flex items-center justify-end">
                  <TierSelector
                    initialTier={student.initialTier}
                    currentTier={resolved.tier}
                    iconSize="sm"
                    onTierChange={updateTier}
                  />
                </div>
              </BasicField>
            </div>

            <div className="grid gap-2">
              <BasicField title="능력 개방" icon={<SparklesIcon className="size-4" />} stackOnMobile>
                <div className="grid grid-cols-3 gap-2">
                  <CompactNumber
                    label="최대 체력"
                    value={resolved.abilityHp}
                    min={0}
                    max={25}
                    disabledReason={getAbilityReleaseDisabledReason(resolved.tier, resolved.level)}
                    onChange={(value) => updateState("abilityHp", value)}
                  />
                  <CompactNumber
                    label="공격력"
                    value={resolved.abilityAtk}
                    min={0}
                    max={25}
                    disabledReason={getAbilityReleaseDisabledReason(resolved.tier, resolved.level)}
                    onChange={(value) => updateState("abilityAtk", value)}
                  />
                  <CompactNumber
                    label="치유력"
                    value={resolved.abilityHeal}
                    min={0}
                    max={25}
                    disabledReason={getAbilityReleaseDisabledReason(resolved.tier, resolved.level)}
                    onChange={(value) => updateState("abilityHeal", value)}
                  />
                </div>
              </BasicField>
            </div>
          </div>
          {signedIn ? (
            <div className="flex items-center justify-end gap-2 px-1 pt-1">
              {released && (
                <>
                  {saved ? <span className="text-xs font-medium text-primary">저장됨</span> : null}
                  <Button
                    variant="secondary"
                    size="xs"
                    className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    disabled={fetcher.state !== "idle" || (!recruited && !draftReady)}
                    onClick={handleSave}
                  >
                    {fetcher.state !== "idle" ? "저장 중" : recruited ? "성장도 저장" : "모집 학생에 등록 후 저장"}
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </SectionCard>
        {fetcher.data && !fetcher.data.ok ? (
          <div className="mt-3">
            <Callout tone="destructive" title={fetcher.data.error} />
          </div>
        ) : null}

        <SectionCard className="mt-2.5 space-y-0 py-3 md:mt-3 md:py-3">
          <div className="grid grid-cols-4 gap-3">
            {primaryStats.map(({ stat, label }) => (
              <div key={stat} className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-4">
                <span className="block truncate text-xs text-muted-foreground">{label}</span>
                <strong className="mt-1 block truncate text-sm font-semibold tabular-nums sm:text-base">
                  {(statValues.get(stat) ?? 0).toLocaleString("ko-KR")}
                </strong>
              </div>
            ))}
          </div>
        </SectionCard>
        {schaleDbId ? (
          <div className="mt-2.5 flex justify-end">
            <Button
              text="Schale DB에서 보기"
              icon={ArrowTopRightOnSquareIcon}
              variant="secondary"
              size="xs"
              href={`https://schaledb.com/student/${schaleDbId}`}
              target="_blank"
            />
          </div>
        ) : null}
      </section>

      {gradingSummary ? (
        <section>
          <div className="flex items-end justify-between gap-3">
            <SubTitle text="학생 평가 요약" />
            <Link
              to={`/students/${student.uid}/gradings`}
              className="mb-3 shrink-0 text-xs font-medium text-primary hover:underline"
            >
              전체 평가 보기
            </Link>
          </div>
          {gradingSummary}
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">스킬</h2>
        <SectionCard className="mt-3 space-y-0 overflow-hidden p-0 md:mt-4 md:p-0">
          {selectedSkills.length === 0 ? (
            <EmptyView text="현재 상태에 맞는 스킬 정보를 불러오지 못했어요" />
          ) : (
            selectedSkills.map((skill) => (
              <SkillRow
                key={`${skill.slot}-${skill.position}-${skill.uid}`}
                skill={skill}
                allSkills={student.skills}
                attackType={student.attackType}
                onLevelChange={(value) => updateState(skillFieldForSlot(skill.slot), value)}
              />
            ))
          )}
        </SectionCard>
      </section>

      <div className="grid items-stretch gap-6 md:gap-8 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold">고유무기</h2>
          <SectionCard className="mt-3 flex flex-1 items-center p-3 md:mt-4 md:p-5">
            <div className="grid w-full grid-cols-[minmax(7rem,1.25fr)_minmax(7rem,1fr)] items-center gap-3 md:gap-4">
              <div className="relative flex h-20 min-w-0 items-center justify-center rounded-lg bg-muted/50 px-2">
                {student.catalog?.weapon.imageUrl ? (
                  <img
                    src={student.catalog.weapon.imageUrl}
                    alt={student.catalog.weapon.name}
                    className="h-16 w-full object-contain"
                  />
                ) : (
                  <div className="h-16 w-full rounded-lg bg-muted" aria-hidden="true" />
                )}
                <div
                  className="absolute right-1.5 bottom-1 flex items-center drop-shadow-sm"
                  role="img"
                  aria-label={`${resolved.weaponStar}성`}
                >
                  {resolved.weaponStar > 0 ? (
                    weaponStars
                      .slice(0, resolved.weaponStar)
                      .map((star) => <StarIconSolid key={star} className="size-4 text-cyan-400" aria-hidden="true" />)
                  ) : (
                    <span className="rounded bg-neutral-900/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      미개방
                    </span>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <strong className="mb-3 block truncate text-sm">{student.catalog?.weapon.name}</strong>
                <LevelSlider
                  label="레벨"
                  value={resolved.weaponLevel}
                  min={resolved.weaponStar > 0 ? 1 : 0}
                  max={getWeaponLevelMaxByTier(resolved.tier)}
                  disabled={resolved.weaponStar === 0}
                  onChange={(value) => updateState("weaponLevel", value)}
                />
              </div>
            </div>
          </SectionCard>
        </section>

        <section className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold">장비</h2>
          <SectionCard className="mt-3 grid flex-1 grid-cols-3 gap-3 space-y-0 p-3 md:mt-4 md:p-5">
            {student.equipments.map((category, index) => {
              const key = ["equip1", "equip2", "equip3"][index] as "equip1" | "equip2" | "equip3";
              const levelKey = `${key}Level` as "equip1Level" | "equip2Level" | "equip3Level";
              const maxTier = Math.max(
                1,
                ...catalog.equipment
                  .filter((equipment) => equipment.category === category)
                  .map((equipment) => equipment.tier),
              );
              const selectedEquipment = catalog.equipment.find(
                (equipment) => equipment.category === category && equipment.tier === resolved[key],
              );
              const equipmentLabel = EQUIPMENT_TYPE_LABELS[category] ?? "장비";
              const unlockLevel = getEquipmentSlotUnlockLevel(index);
              const locked = resolved.level < unlockLevel;
              return (
                <div key={key} className="min-w-0">
                  <div className="relative mb-2 flex h-16 items-center justify-center overflow-hidden rounded-lg bg-muted/50">
                    {selectedEquipment ? (
                      <img
                        src={equipmentImageUrl(selectedEquipment.uid)}
                        alt={selectedEquipment.name}
                        className="size-11 -translate-y-1 object-contain"
                      />
                    ) : (
                      <div className="size-11" aria-hidden="true" />
                    )}
                    <div className="pointer-events-none absolute inset-x-1.5 bottom-1 flex min-w-0 items-center justify-between gap-1">
                      <span className="truncate rounded-sm bg-card/90 px-1.5 py-0.5 text-[10px] font-medium shadow-sm ring-1 ring-border/40">
                        {equipmentLabel}
                      </span>
                      <strong className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground shadow-sm">
                        T{resolved[key]}
                      </strong>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <LevelSlider
                      label={equipmentLabel}
                      value={resolved[key]}
                      valuePrefix="T"
                      min={1}
                      max={maxTier}
                      showHeader={false}
                      disabled={locked}
                      onChange={(value) => {
                        const equipmentLevelMax = getEquipmentMaxLevel(catalog, category, value);
                        setSaved(false);
                        setState((current) => ({
                          ...current,
                          [key]: value,
                          [levelKey]: equipmentLevelMax,
                        }));
                      }}
                    />
                    <LevelSlider
                      label={`${equipmentLabel} 레벨`}
                      value={resolved[levelKey]}
                      valuePrefix="Lv."
                      min={1}
                      max={selectedEquipment?.maxLevel ?? 1}
                      showHeader
                      disabled={locked || selectedEquipment === undefined}
                      onChange={(value) => updateState(levelKey, value)}
                    />
                    {locked ? (
                      <span className="block text-center text-[10px] font-medium text-muted-foreground">
                        학생 Lv.{unlockLevel}부터 적용
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {student.catalog?.gear
              ? (() => {
                  const selectedGearTier = student.catalog.gear?.tiers.find(
                    (tier) => tier.tier === resolved.equipSpecial,
                  );
                  const gearLocked = selectedGearTier != null && resolved.bond < selectedGearTier.openFavorLevel;
                  return (
                    <div className="col-span-3 flex items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <SparklesIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <LevelSlider
                          label={student.catalog.gear.name}
                          value={resolved.equipSpecial}
                          valuePrefix="T"
                          min={0}
                          max={2}
                          onChange={(value) => updateState("equipSpecial", value)}
                        />
                        {gearLocked ? (
                          <span className="block text-[10px] font-medium text-muted-foreground">
                            인연 Lv.{selectedGearTier?.openFavorLevel}부터 적용
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              : null}
          </SectionCard>
        </section>
      </div>
    </div>
  );
}

function BasicField({
  title,
  icon,
  children,
  stackOnMobile = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  stackOnMobile?: boolean;
}) {
  return (
    <div
      className={`grid min-w-0 items-center rounded-md bg-muted/50 p-2 ${
        stackOnMobile ? "grid-cols-1 gap-1.5" : "grid-cols-[6rem_minmax(0,1fr)] gap-2"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          {icon}
        </span>
        <strong className="truncate text-sm">{title}</strong>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CompactNumber({
  label,
  value,
  min,
  max,
  disabledReason,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabledReason: string | null;
  onChange: (value: number) => void;
}) {
  return (
    <HoverTooltip
      as="div"
      content={disabledReason ?? ""}
      disabled={disabledReason === null}
      focusable={disabledReason !== null}
      className="min-w-0"
      contentClassName="max-w-64 text-center"
    >
      <NumberInput
        label={label}
        fullWidth
        size="sm"
        minValue={min}
        maxValue={max}
        value={value}
        showMax
        disabled={disabledReason !== null}
        controlClassName="border-0 bg-card shadow-sm"
        onChange={onChange}
      />
    </HoverTooltip>
  );
}

export function getAbilityReleaseDisabledReason(tier: number, level = 90): string | null {
  if (tier <= 5) {
    return "고유무기 1성부터 능력 개방을 설정할 수 있어요";
  }
  if (level < 90) {
    return "학생 레벨 90부터 능력 개방을 설정할 수 있어요";
  }
  return null;
}

function LevelSlider({
  label,
  value,
  min,
  max,
  valuePrefix,
  showHeader = true,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  valuePrefix?: string;
  showHeader?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const sliderMax = Math.max(min, max);
  const clampedValue = Math.min(Math.max(value, min), sliderMax);
  const progress = sliderMax === min ? 0 : ((clampedValue - min) / (sliderMax - min)) * 100;

  return (
    <label className={disabled ? "block min-w-0 opacity-45" : "block min-w-0"}>
      {showHeader ? (
        <span className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium">{label}</span>
          <strong className="shrink-0 tabular-nums text-primary">
            {valuePrefix}
            {value}
          </strong>
        </span>
      ) : null}
      <span className={`relative mx-1.5 block h-4 ${showHeader ? "mt-1.5" : "mt-0.5"}`}>
        <input
          type="range"
          aria-label={`${label} ${valuePrefix ?? ""}${value}`}
          className="peer absolute -inset-x-1.5 top-0 z-10 h-4 w-[calc(100%+0.75rem)] cursor-pointer opacity-0 disabled:cursor-default"
          min={min}
          max={sliderMax}
          value={clampedValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" aria-hidden="true" />
        <span
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-sm transition-[left] peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-2"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

function SkillRow({
  skill,
  allSkills,
  attackType,
  onLevelChange,
}: {
  skill: ReturnType<typeof selectStudentSkills>[number];
  allSkills: StudentCalculatorSource["skills"];
  attackType: Attack;
  onLevelChange: (value: number) => void;
}) {
  const linkedSkills = [
    ...skill.additionalSkillUids.map((uid) => ({ uid, label: "추가" })),
    ...skill.selectableSkills.map(({ skillUid, condition }) => ({
      uid: skillUid,
      label: getSkillSelectionConditionLabel(condition),
    })),
  ].flatMap(({ uid, label }) => {
    const linked = allSkills.find((candidate) => candidate.uid === uid);
    return linked ? [{ ...linked, label }] : [];
  });

  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-3 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_8rem] md:gap-4 md:p-5">
      <div
        className={`relative flex h-12 w-[2.598rem] justify-self-center items-center justify-center ${skillIconColorClass[attackType]}`}
      >
        <svg viewBox="0 0 41.569 48" className="absolute inset-0 size-full drop-shadow-sm" aria-hidden="true">
          <path
            fill="currentColor"
            d="M18.211 1.5 Q20.785 0 23.358 1.5 L38.996 10.5 Q41.569 12 41.569 15 L41.569 33 Q41.569 36 38.996 37.5 L23.358 46.5 Q20.785 48 18.211 46.5 L2.573 37.5 Q0 36 0 33 L0 15 Q0 12 2.573 10.5 Z"
          />
        </svg>
        {skill.iconUrl ? (
          <img src={skill.iconUrl} alt="" className="relative z-10 size-12 object-contain drop-shadow-sm" />
        ) : null}
      </div>
      <div className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">{skillSlotLabels[skill.slot]}</span>
        <strong className="mt-0.5 block">{skill.name}</strong>
        <SkillDescription skill={{ ...skill, selectedLevel: skill.selectedLevel }} />
        {linkedSkills.map((linked) => (
          <div key={linked.uid} className="mt-3 border-l-2 border-border pl-3">
            <span className="text-xs font-medium text-muted-foreground">{linked.label}</span>
            <strong className="mt-0.5 block text-sm">{linked.name}</strong>
            <SkillDescription skill={{ ...linked, selectedLevel: skill.selectedLevel }} />
          </div>
        ))}
      </div>
      <div className="col-span-2 sm:col-span-1">
        <LevelSlider label="레벨" value={skill.selectedLevel} min={1} max={skill.maxLevel} onChange={onLevelChange} />
      </div>
    </div>
  );
}

function SkillDescription({ skill }: { skill: Parameters<typeof renderStudentSkillDescriptionParts>[0] }) {
  const parts = renderStudentSkillDescriptionParts(skill);
  if (!parts) return null;
  return (
    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
      {parts.map((part) =>
        part.dynamic ? (
          <span key={part.key} className={part.emphasized ? "font-semibold text-primary" : "text-primary"}>
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

function skillFieldForSlot(slot: StudentSkillTypeEnum): "skillEx" | "skillNormal" | "skillEnhanced" | "skillSub" {
  if (slot === "ex") return "skillEx";
  if (slot === "public") return "skillNormal";
  if (slot === "passive") return "skillEnhanced";
  return "skillSub";
}
