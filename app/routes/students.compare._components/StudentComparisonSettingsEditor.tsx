import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { LevelSlider, TierSelector } from "~/components/features/students";
import { Button, Callout, NumberInput, Toggle } from "~/components/primitives";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import type {
  StudentCalculatedStat,
  StudentCalculatorCatalog,
  StudentCalculatorSource,
} from "~/domain/student-calculator";
import { getAbilityReleaseDisabledReason } from "~/domain/student-calculator";
import {
  getStudentComparisonEquipmentMaxTier,
  getStudentComparisonEquipmentStatus,
  type StudentComparisonSettingField,
  type StudentComparisonSettings,
} from "~/domain/student-comparison";
import type { StudentCatalogStat } from "~/graphql/graphql";
import type { StudentComparisonStudent } from "~/models/student-comparison";

const previewStats = [
  { stat: "MAX_HP" as StudentCatalogStat, label: "최대 체력" },
  { stat: "ATTACK_POWER" as StudentCatalogStat, label: "공격력" },
  { stat: "DEFENSE_POWER" as StudentCatalogStat, label: "방어력" },
  { stat: "HEAL_POWER" as StudentCatalogStat, label: "치유력" },
] as const;

type StudentComparisonSettingsEditorProps = {
  student: StudentComparisonStudent;
  catalog: StudentCalculatorCatalog;
  settings: StudentComparisonSettings | null;
  invalidFields: StudentComparisonSettingField[];
  settingsErrors: string[];
  stats: StudentCalculatedStat[] | null;
  calculationFailed: boolean;
  showStatsPreview: boolean;
  onChange: <K extends StudentComparisonSettingField>(field: K, value: StudentComparisonSettings[K]) => void;
  onReset: () => void;
  onClose?: () => void;
};

export default function StudentComparisonSettingsEditor({
  student,
  catalog,
  settings,
  invalidFields,
  settingsErrors,
  stats,
  calculationFailed,
  showStatsPreview,
  onChange,
  onReset,
  onClose,
}: StudentComparisonSettingsEditorProps) {
  if (!settings) {
    return (
      <div className="space-y-3" role="alert">
        <Callout tone="destructive" title="성장도 설정을 읽을 수 없어요">
          링크의 설정 값이 올바르지 않습니다. 이 칸의 설정을 초기화하면 다시 조절할 수 있어요.
          {invalidFields.length > 0 ? <span className="sr-only">잘못된 항목: {invalidFields.join(", ")}</span> : null}
        </Callout>
        <Button text="이 칸 설정 초기화" variant="secondary" size="sm" onClick={onReset} />
      </div>
    );
  }

  const equipmentMaxTier = getStudentComparisonEquipmentMaxTier(student as StudentCalculatorSource, catalog);
  const equipmentStatus = getStudentComparisonEquipmentStatus(
    student as StudentCalculatorSource,
    catalog,
    settings,
    EQUIPMENT_TYPE_LABELS,
  );
  const equipmentStatusMessages = equipmentStatus
    .filter((item) => item.status !== "applied")
    .map((item) =>
      item.status === "locked"
        ? `${item.label} · 학생 Lv.${item.unlockLevel}부터`
        : item.status === "unsupported"
          ? `${item.label} T${item.tier} 정보 없음`
          : `${item.label} 정보 없음`,
    );
  const abilityReleaseReason = getAbilityReleaseDisabledReason(settings.tier, settings.level);
  const favoriteGearMaxTier = student.catalog?.gear
    ? Math.max(0, ...student.catalog.gear.tiers.map((tier) => tier.tier))
    : null;
  const favoriteGear = favoriteGearMaxTier
    ? student.catalog?.gear?.tiers.find((tier) => tier.tier === favoriteGearMaxTier)
    : null;
  const favoriteGearLocked = favoriteGear != null && settings.bond < favoriteGear.openFavorLevel;
  const statMap = new Map(stats?.map(({ stat, value }) => [stat, value]));

  return (
    <div className={showStatsPreview ? "space-y-2" : "space-y-3"}>
      {settingsErrors.length > 0 ? (
        <Callout tone="destructive" title="성장도 단계를 확인해 주세요">
          {settingsErrors.join(" ")}
        </Callout>
      ) : null}

      {showStatsPreview ? (
        <dl className="grid grid-cols-4 gap-2" aria-label={`${student.name} 주요 능력치 현재값`}>
          {previewStats.map(({ stat, label }) => {
            const value = statMap.get(stat);
            return (
              <div key={stat} className="min-w-0 rounded-md bg-muted/70 px-2 py-2">
                <dt className="truncate text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 truncate text-sm font-medium tabular-nums">
                  {calculationFailed
                    ? "계산할 수 없음"
                    : value === undefined
                      ? "자료 없음"
                      : value.toLocaleString("ko-KR")}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <NumberInput
          label="레벨"
          fullWidth
          minValue={1}
          maxValue={90}
          inputProps={{ "aria-label": "레벨" }}
          value={settings.level}
          showMax
          onChange={(value) => onChange("level", value)}
        />
        <NumberInput
          label="인연 랭크"
          fullWidth
          minValue={1}
          maxValue={100}
          inputProps={{ "aria-label": "인연 랭크" }}
          value={settings.bond}
          showMax
          onChange={(value) => onChange("bond", value)}
        />
        <div className="col-span-2 space-y-1">
          <span className="block text-sm font-medium text-foreground">신비 해방</span>
          <TierSelector
            initialTier={student.initialTier}
            currentTier={settings.tier}
            iconSize="sm"
            onTierChange={(value) => onChange("tier", value)}
          />
        </div>
        <div className="col-span-2">
          <LevelSlider
            label="장비 티어"
            value={settings.equipmentTier ?? equipmentMaxTier}
            min={1}
            max={equipmentMaxTier}
            valueLabel={settings.equipmentTier === null ? "최고" : `T${settings.equipmentTier}`}
            disabled={equipmentStatus.every((item) => item.status === "missing")}
            onChange={(value) => onChange("equipmentTier", value >= equipmentMaxTier ? null : value)}
          />
          {equipmentStatusMessages.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {equipmentStatusMessages.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        {favoriteGearMaxTier === null ? (
          <p className="text-xs text-muted-foreground">애용품 정보 없음</p>
        ) : favoriteGearLocked ? (
          <p className="text-xs text-muted-foreground">
            애용품 T{favoriteGearMaxTier} · 인연 Lv.{favoriteGear?.openFavorLevel}부터 적용
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">애용품 T{favoriteGearMaxTier} 적용</p>
        )}
        {abilityReleaseReason ? (
          <p className="text-xs text-muted-foreground">능력 개방 미적용 · {abilityReleaseReason}</p>
        ) : (
          <p className="text-xs text-muted-foreground">능력 개방 최대 적용</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="danger-subtle" size="xs" onClick={onReset}>
          <div className="flex items-center gap-2">
            <AdjustmentsHorizontalIcon className="size-4 shrink-0 text-destructive" strokeWidth={2} />
            <span className="text-foreground">초기화</span>
          </div>
        </Button>
        <Toggle
          label="스킬 효과 반영"
          initialState={settings.includeSkillEffects}
          className="my-0 w-fit shrink-0 whitespace-nowrap"
          onChange={(enabled) => onChange("includeSkillEffects", enabled)}
        />
      </div>

      {showStatsPreview && onClose ? <Button text="완료" variant="inverse" fullWidth onClick={onClose} /> : null}
    </div>
  );
}
