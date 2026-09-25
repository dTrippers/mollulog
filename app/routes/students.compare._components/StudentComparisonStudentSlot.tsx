import { ChevronDownIcon, StarIcon } from "@heroicons/react/16/solid";
import { Fragment, type ReactNode } from "react";
import { Button, ProfileImage } from "~/components/primitives";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import {
  getAbilityReleaseDisabledReason,
  getEquipmentSlotUnlockLevel,
  resolveStudentCalculatorState,
  type StudentCalculatorCatalog,
} from "~/domain/student-calculator";
import type { StudentComparisonSettings, StudentComparisonSide } from "~/domain/student-comparison";
import { ABILITY_RELEASE_MAX_LEVEL } from "~/domain/student-growth-state";
import type { StudentComparisonStudent } from "~/models/student-comparison";

type StudentComparisonStudentSlotProps = {
  side: StudentComparisonSide;
  student: StudentComparisonStudent | null;
  uidError: string | null;
  chooserOpen: boolean;
  settings: StudentComparisonSettings | null;
  equipmentCatalog: StudentCalculatorCatalog["equipment"] | null;
  settingsErrors: string[];
  onOpenChooser: () => void;
  onOpenSettings: () => void;
};

type SummaryValue = { label: string; value: string };
type SummaryGroup = { title: string; values: SummaryValue[]; note?: string };

function showValue(value: number | null, format: (value: number) => string = String): string {
  return value === null ? "자료 없음" : format(value);
}

function getGrowthSummary(student: StudentComparisonStudent, settings: StudentComparisonSettings): SummaryGroup[] {
  const resolved = resolveStudentCalculatorState(student, settings);
  const abilityReleaseReason = getAbilityReleaseDisabledReason(resolved.tier, resolved.level);
  const weaponLevel = showValue(settings.weaponLevel, (value) => `Lv.${value}`);
  const equipmentName = (index: number) => {
    const category = student.equipments[index];
    return category ? (EQUIPMENT_TYPE_LABELS[category] ?? `장비 ${index + 1}`) : `장비 ${index + 1}`;
  };
  const lockedEquipment = student.catalog
    ? student.equipments.flatMap((category, index) => {
        const unlockLevel = getEquipmentSlotUnlockLevel(index);
        const label = category ? EQUIPMENT_TYPE_LABELS[category] : undefined;
        return label && resolved.level < unlockLevel ? [`${label} · Lv.${unlockLevel}부터`] : [];
      })
    : [];
  const selectedGear =
    settings.equipSpecial === null
      ? undefined
      : student.catalog?.gear?.tiers.find((tier) => tier.tier === settings.equipSpecial);
  const lockedGear =
    selectedGear && resolved.bond < selectedGear.openFavorLevel
      ? `미적용: 애용품 · 인연 Lv.${selectedGear.openFavorLevel}부터`
      : null;
  const abilityReleaseNote = abilityReleaseReason
    ? `미적용 · ${resolved.tier <= 5 ? "고유무기 1성부터" : "Lv.90부터"}`
    : null;
  return [
    {
      title: "기본 성장",
      note:
        settings.tier !== null && settings.tier <= 5 && settings.weaponLevel !== null
          ? "미적용 · 고유무기 1성부터"
          : undefined,
      values: [
        { label: "레벨", value: showValue(settings.level, (value) => `Lv.${value}`) },
        { label: "신비 해방", value: showValue(settings.tier, (value) => `${value}성`) },
        { label: "인연 랭크", value: showValue(settings.bond, (value) => `Lv.${value}`) },
        { label: "고유무기 레벨", value: weaponLevel },
      ],
    },
    {
      title: "스킬",
      values: [
        { label: "EX", value: showValue(settings.skillEx, (value) => `Lv.${value}`) },
        { label: "기본", value: showValue(settings.skillNormal, (value) => `Lv.${value}`) },
        { label: "강화", value: showValue(settings.skillEnhanced, (value) => `Lv.${value}`) },
        { label: "서브", value: showValue(settings.skillSub, (value) => `Lv.${value}`) },
      ],
    },
    {
      title: "장비",
      note: lockedEquipment.length > 0 ? `미적용: ${lockedEquipment.join(" · ")}` : undefined,
      values: [
        { label: `${equipmentName(0)} 티어`, value: showValue(settings.equip1, (value) => `T${value}`) },
        { label: `${equipmentName(0)} 레벨`, value: showValue(settings.equip1Level, (value) => `Lv.${value}`) },
        { label: `${equipmentName(1)} 티어`, value: showValue(settings.equip2, (value) => `T${value}`) },
        { label: `${equipmentName(1)} 레벨`, value: showValue(settings.equip2Level, (value) => `Lv.${value}`) },
        { label: `${equipmentName(2)} 티어`, value: showValue(settings.equip3, (value) => `T${value}`) },
        { label: `${equipmentName(2)} 레벨`, value: showValue(settings.equip3Level, (value) => `Lv.${value}`) },
        { label: "애용품 티어", value: showValue(settings.equipSpecial, (value) => `T${value}`) },
      ],
    },
    {
      title: "추가 성장",
      note: [lockedGear, abilityReleaseNote].filter((note): note is string => note !== null).join(" · ") || undefined,
      values: [
        {
          label: "능력 개방 체력",
          value: showValue(settings.abilityHp, (value) => `Lv.${value}`),
        },
        {
          label: "능력 개방 공격력",
          value: showValue(settings.abilityAtk, (value) => `Lv.${value}`),
        },
        {
          label: "능력 개방 치유력",
          value: showValue(settings.abilityHeal, (value) => `Lv.${value}`),
        },
      ],
    },
  ];
}

function getQuickSummary(
  student: StudentComparisonStudent,
  settings: StudentComparisonSettings,
  groups: SummaryGroup[],
  equipmentCatalog: StudentCalculatorCatalog["equipment"] | null,
): [ReactNode, ReactNode] {
  const level = showValue(settings.level, (value) => `Lv.${value}`);
  const bond = showValue(settings.bond, (value) => `인연 ${value}`);
  const skillAtMaximum =
    settings.skillEx === 5 && settings.skillNormal === 10 && settings.skillEnhanced === 10 && settings.skillSub === 10;
  const skills = skillAtMaximum
    ? "스킬 최대"
    : `스킬 ${[settings.skillEx, settings.skillNormal, settings.skillEnhanced, settings.skillSub]
        .map((value) => showValue(value))
        .join("/")}`;
  const equipmentTierFields = ["equip1", "equip2", "equip3"] as const;
  const equipmentLevelFields = ["equip1Level", "equip2Level", "equip3Level"] as const;
  const equipmentTiers = equipmentTierFields
    .map((field, index) => {
      const category = student.equipments[index];
      return category ? showValue(settings[field], (tier) => `T${tier}`) : "자료 없음";
    })
    .join("/");
  const equipmentAtMaximum =
    equipmentCatalog !== null &&
    student.catalog !== null &&
    settings.level !== null &&
    equipmentTierFields.every((tierField, index) => {
      const levelField = equipmentLevelFields[index];
      const category = student.equipments[index];
      if (
        levelField === undefined ||
        category === undefined ||
        category === null ||
        settings.level === null ||
        settings.level < getEquipmentSlotUnlockLevel(index)
      ) {
        return false;
      }
      const categoryEquipment = equipmentCatalog.filter((equipment) => equipment.category === category);
      if (categoryEquipment.length === 0) return false;
      const maxTier = Math.max(...categoryEquipment.map((equipment) => equipment.tier));
      const selectedTier = settings[tierField];
      const selectedEquipment = categoryEquipment.find((equipment) => equipment.tier === selectedTier);
      return (
        selectedTier === maxTier &&
        selectedEquipment !== undefined &&
        settings[levelField] === selectedEquipment.maxLevel
      );
    });
  const equipmentSummary = equipmentAtMaximum ? "장비 최대" : `장비 ${equipmentTiers}`;
  const abilityAtMaximum =
    settings.abilityHp === ABILITY_RELEASE_MAX_LEVEL &&
    settings.abilityAtk === ABILITY_RELEASE_MAX_LEVEL &&
    settings.abilityHeal === ABILITY_RELEASE_MAX_LEVEL;
  const abilityValues = [settings.abilityHp, settings.abilityAtk, settings.abilityHeal]
    .map((value) => showValue(value))
    .join("/");
  const abilitySummary = abilityAtMaximum ? "능력 개방 최대" : `능력 개방 ${abilityValues}`;
  const hasUnapplied = groups.some((group) => group.note !== undefined);
  const tierSummary =
    settings.tier === null ? (
      "신비 해방 자료 없음"
    ) : settings.tier <= 5 ? (
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        <span className="sr-only">신비 해방 </span>
        <StarIcon aria-hidden="true" className="size-3.5 shrink-0 text-yellow-500" />
        <span className="tabular-nums">{settings.tier}</span>
        <span className="sr-only">성</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        <span className="sr-only">고유무기 </span>
        <img className="size-3.5 shrink-0" src="/icons/exclusive_weapon.png" alt="" aria-hidden="true" />
        <span className="tabular-nums">{settings.tier - 5}</span>
        <span className="sr-only">성</span>
      </span>
    );

  return [
    <>
      <span className="whitespace-nowrap">{level}</span>
      <span aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">{tierSummary}</span>
      <span aria-hidden="true">·</span>
      <span className="whitespace-nowrap">{bond}</span>
    </>,
    <>
      <span className="whitespace-nowrap">{skills}</span>
      {"\u00a0· "}
      <span className="whitespace-nowrap">{equipmentSummary}</span>
      {"\u00a0· "}
      <span className="whitespace-nowrap">{abilitySummary}</span>
      {hasUnapplied ? (
        <>
          {"\u00a0· "}
          <span className="whitespace-nowrap">미적용 있음</span>
        </>
      ) : null}
    </>,
  ];
}

function withoutLevelPrefix(value: string): string {
  return value.startsWith("Lv.") ? value.slice(3) : value;
}

function getGrowthDetails(summary: SummaryGroup[]): SummaryGroup[] {
  const basicGrowth = summary.find((group) => group.title === "기본 성장");
  const skills = summary.find((group) => group.title === "스킬");
  const equipment = summary.find((group) => group.title === "장비");
  const additionalGrowth = summary.find((group) => group.title === "추가 성장");
  const valueFor = (group: SummaryGroup | undefined, label: string) =>
    group?.values.find((value) => value.label === label)?.value ?? "자료 없음";
  const skillDetails =
    skills?.values.map(({ label, value }) => `${label} ${withoutLevelPrefix(value)}`).join(" · ") ?? "자료 없음";
  const equipmentDetails = [0, 1, 2]
    .map((index) => {
      const tier = equipment?.values[index * 2];
      const level = equipment?.values[index * 2 + 1];
      const label = tier?.label.replace(/ 티어$/, "") ?? `장비 ${index + 1}`;
      return `${label} ${tier?.value ?? "자료 없음"}/${level?.value ?? "자료 없음"}`;
    })
    .join(" · ");
  const favoriteGearLabel =
    equipment?.values.find((value) => value.label === "애용품 티어")?.label.replace(/ 티어$/, "") ?? "애용품";
  const favoriteGearValue = valueFor(equipment, "애용품 티어");
  const abilityLabels = ["체력", "공격", "치유"] as const;
  const abilityDetails =
    additionalGrowth?.values
      .map(({ value }, index) => `${abilityLabels[index] ?? "자료 없음"} ${withoutLevelPrefix(value)}`)
      .join(" / ") ?? "자료 없음";
  const additionalNotes = [basicGrowth?.note, additionalGrowth?.note].filter(
    (note): note is string => note !== undefined,
  );

  return [
    { title: "스킬", values: [{ label: "", value: skillDetails }] },
    {
      title: "장비",
      values: [{ label: "", value: equipmentDetails }],
      note: equipment?.note,
    },
    {
      title: "추가 성장",
      values: [{ label: "", value: `${favoriteGearLabel} ${favoriteGearValue} · 능력 개방 ${abilityDetails}` }],
      note: additionalNotes.length > 0 ? additionalNotes.join(" · ") : undefined,
    },
    { title: "스킬 효과", values: [{ label: "", value: "반영" }] },
  ];
}

export default function StudentComparisonStudentSlot({
  side,
  student,
  uidError,
  chooserOpen,
  settings,
  equipmentCatalog,
  settingsErrors,
  onOpenChooser,
  onOpenSettings,
}: StudentComparisonStudentSlotProps) {
  const sideLabel = side === "left" ? "첫 번째 학생" : "두 번째 학생";
  const studentName = student?.name ?? sideLabel;
  const titleId = `${side}-student-title`;
  const sideLabelId = `${side}-student-side-label`;
  const slotErrorId = `${side}-student-slot-error`;
  const growthId = `${side}-growth-summary`;
  const summary = student && settings ? getGrowthSummary(student, settings) : null;
  const quickSummary =
    student && settings && summary ? getQuickSummary(student, settings, summary, equipmentCatalog) : null;
  const growthDetails = settings && summary ? getGrowthDetails(summary) : null;

  return (
    <section
      aria-labelledby={`${sideLabelId} ${titleId}`}
      className="min-w-0 rounded-lg border border-border/70 bg-card p-3 sm:p-4"
    >
      <div className="flex min-h-12 min-w-0 items-center gap-[11px]">
        <span aria-hidden="true" className="shrink-0 [&>*]:!size-12 [&_svg]:!size-10">
          <ProfileImage studentUid={student?.uid ?? null} imageSize={12} />
        </span>
        <div className="min-w-0">
          <p id={sideLabelId} className="text-[11px] leading-tight text-muted-foreground">
            {sideLabel}
          </p>
          <h2
            id={titleId}
            className="mt-0.5 min-w-0 break-keep text-[17px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]"
          >
            {student ? student.name : "학생 선택"}
          </h2>
        </div>
      </div>

      {uidError ? (
        <p id={slotErrorId} className="mt-2 text-xs leading-tight text-destructive" role="alert">
          학생 정보 오류 · 바꾸기에서 학생을 다시 선택해 주세요.
        </p>
      ) : null}
      {student && !student.catalog ? (
        <p className="mt-2 text-xs text-muted-foreground">학생 능력치 자료가 없어 성장도를 편집할 수 없어요.</p>
      ) : null}
      {settingsErrors.length > 0 ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {settingsErrors.join(" ")}
        </p>
      ) : null}

      {student && settings && summary && quickSummary ? (
        <>
          <div id={growthId} className="mt-3 min-h-[43px] space-y-0.5 text-xs">
            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-medium leading-tight text-foreground">
              {quickSummary[0]}
            </p>
            <p className="text-muted-foreground">{quickSummary[1]}</p>
          </div>
          <details className="group mt-[7px] text-xs">
            <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <span>적용된 성장도 전체 보기</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-border/70 pt-2 text-xs leading-[1.5]">
              {growthDetails?.map((group) => (
                <Fragment key={group.title}>
                  <dt className="text-muted-foreground">{group.title}</dt>
                  <dd className="min-w-0 break-words text-foreground">
                    {group.values.map(({ value }) => (
                      <span key={value}>{value}</span>
                    ))}
                    {group.note ? <span className="block text-muted-foreground">{group.note}</span> : null}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </details>
        </>
      ) : student ? (
        <p id={growthId} className="mt-3 text-xs text-destructive" role="alert">
          성장도 링크를 확인해 주세요. 설정을 열어 초기화하면 다시 조절할 수 있어요.
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-[7px]">
        <Button
          text={student ? "다른 학생 선택" : "학생 선택"}
          variant="secondary"
          size="xs"
          fullWidth
          className="min-h-[34px] rounded-md border-border"
          aria-label={student ? `${student.name} 다른 학생 선택` : `${sideLabel} 선택`}
          aria-describedby={uidError ? slotErrorId : undefined}
          aria-expanded={chooserOpen}
          aria-haspopup="dialog"
          onClick={onOpenChooser}
        />
        <Button
          text="성장도 설정"
          variant="secondary"
          size="xs"
          fullWidth
          className="min-h-[34px] rounded-md border-border"
          disabled={!student?.catalog}
          aria-label={`${studentName} 성장도 설정`}
          aria-describedby={student?.catalog ? growthId : undefined}
          aria-haspopup="dialog"
          onClick={onOpenSettings}
        />
      </div>
    </section>
  );
}
