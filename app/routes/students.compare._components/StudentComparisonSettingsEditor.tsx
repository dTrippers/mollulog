import { Fragment } from "react";
import { LevelSlider, TierSelector } from "~/components/features/students";
import { Button, Callout } from "~/components/primitives";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import {
  getAbilityReleaseDisabledReason,
  getEquipmentSlotUnlockLevel,
  resolveStudentCalculatorState,
  type StudentCalculatorCatalog,
  type StudentCalculatorSource,
  type StudentCalculatorState,
  selectStudentSkills,
} from "~/domain/student-calculator";
import {
  getStudentComparisonEquipmentMaxTier,
  type StudentComparisonSettingField,
  type StudentComparisonSettings,
} from "~/domain/student-comparison";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";
import type { StudentComparisonStudent } from "~/models/student-comparison";

const skillFields = [
  { slot: "ex", field: "skillEx", label: "EX 스킬" },
  { slot: "public", field: "skillNormal", label: "기본 스킬" },
  { slot: "passive", field: "skillEnhanced", label: "강화 스킬" },
  { slot: "extra_passive", field: "skillSub", label: "서브 스킬" },
] as const satisfies readonly {
  slot: "ex" | "public" | "passive" | "extra_passive";
  field: "skillEx" | "skillNormal" | "skillEnhanced" | "skillSub";
  label: string;
}[];

const equipmentFields = [
  { tier: "equip1", level: "equip1Level" },
  { tier: "equip2", level: "equip2Level" },
  { tier: "equip3", level: "equip3Level" },
] as const;

type SettingSliderProps = {
  title: string;
  accessibleLabel: string;
  value: number | null;
  valueLabel: string;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function SettingSlider({
  title,
  accessibleLabel,
  value,
  valueLabel,
  min,
  max,
  disabled = false,
  onChange,
}: SettingSliderProps) {
  const headingClassName = `mb-1 flex items-center justify-between gap-3 text-xs${disabled ? " opacity-45" : ""}`;

  if (value === null) {
    return (
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="sr-only">{accessibleLabel} 설정값 없음</legend>
        <div aria-hidden="true" className={headingClassName}>
          <span className="truncate font-medium">{title}</span>
          <span className="shrink-0 text-muted-foreground">설정값 없음</span>
        </div>
      </fieldset>
    );
  }

  return (
    <div className="min-w-0">
      <div aria-hidden="true" className={headingClassName}>
        <span className="truncate font-medium">{title}</span>
        <strong className="shrink-0 tabular-nums text-foreground">{valueLabel}</strong>
      </div>
      <LevelSlider
        label={accessibleLabel}
        value={value}
        min={min}
        max={max}
        valueLabel={valueLabel}
        showHeader={false}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

type StudentComparisonSettingsEditorProps = {
  student: StudentComparisonStudent;
  catalog: StudentCalculatorCatalog;
  settings: StudentComparisonSettings | null;
  invalidFields: StudentComparisonSettingField[];
  settingsErrors: string[];
  importMessage: string | null;
  isImporting: boolean;
  canCopyComparisonGrowth?: boolean;
  onImportSaved: () => void;
  onCopyComparisonGrowth?: () => void;
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
  importMessage,
  isImporting,
  canCopyComparisonGrowth = false,
  onImportSaved,
  onCopyComparisonGrowth,
  onChange,
  onReset,
  onClose,
}: StudentComparisonSettingsEditorProps) {
  const importButton = (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <Button
          text={isImporting ? "내 학생 성장도 불러오는 중" : "내 학생 성장도 반영"}
          variant="secondary"
          size="sm"
          fullWidth
          className="h-auto min-h-10 whitespace-normal leading-tight"
          disabled={isImporting}
          onClick={onImportSaved}
        />
        <Button
          text="비교 학생과 동일한 성장도 반영"
          variant="secondary"
          size="sm"
          fullWidth
          className="h-auto min-h-10 whitespace-normal leading-tight"
          disabled={!canCopyComparisonGrowth || isImporting}
          onClick={onCopyComparisonGrowth}
        />
      </div>
      {importMessage ? (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {importMessage}
        </p>
      ) : null}
    </div>
  );

  if (!settings) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto no-scrollbar pb-4">
          {importButton}
          <div role="alert">
            <Callout tone="destructive" title="성장도 설정을 읽을 수 없어요">
              링크의 설정 값이 올바르지 않습니다. 잘못된 항목을 확인하고 이 칸의 설정을 초기화하면 다시 조절할 수
              있어요.
              {invalidFields.length > 0 ? (
                <span className="sr-only">잘못된 항목: {invalidFields.join(", ")}</span>
              ) : null}
            </Callout>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">
          <Button text="초기화" size="xs" variant="danger-subtle" className="min-w-16" onClick={onReset} />
          {onClose ? <Button text="완료" size="xs" variant="inverse" className="min-w-16" onClick={onClose} /> : null}
        </div>
      </div>
    );
  }

  const source = student as StudentCalculatorSource;
  const calculatorState = settings as StudentCalculatorState;
  const resolved = resolveStudentCalculatorState(source, calculatorState, catalog);
  const selectedSkills = selectStudentSkills(source, calculatorState);
  const skillMaxBySlot = new Map<string, number>();
  for (const skill of selectedSkills) {
    skillMaxBySlot.set(skill.slot, Math.max(skill.maxLevel, skillMaxBySlot.get(skill.slot) ?? 1));
  }
  const abilityReleaseReason = getAbilityReleaseDisabledReason(resolved.tier, resolved.level);
  const weaponLevelMax = getWeaponLevelMaxByTier(resolved.tier);
  const gearTiers = student.catalog?.gear?.tiers ?? [];
  const selectedGear = gearTiers.find((tier) => tier.tier === settings.equipSpecial);
  const gearLocked = selectedGear != null && resolved.bond < selectedGear.openFavorLevel;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto no-scrollbar pb-4">
        {importButton}

        {settingsErrors.length > 0 ? (
          <Callout tone="destructive" title="성장도 단계를 확인해 주세요">
            {settingsErrors.join(" ")}
          </Callout>
        ) : null}

        <section className="space-y-3" aria-labelledby="comparison-growth-basic-title">
          <h3 id="comparison-growth-basic-title" className="text-sm font-semibold text-foreground">
            기본 성장
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <SettingSlider
              title="레벨"
              accessibleLabel="레벨"
              value={settings.level}
              valueLabel={settings.level === null ? "" : String(settings.level)}
              min={1}
              max={90}
              onChange={(value) => onChange("level", value)}
            />
            <SettingSlider
              title="인연 랭크"
              accessibleLabel="인연 랭크"
              value={settings.bond}
              valueLabel={settings.bond === null ? "" : String(settings.bond)}
              min={1}
              max={100}
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
            <div className="col-span-2 space-y-1">
              {student.catalog?.weapon ? (
                <SettingSlider
                  title="고유무기 레벨"
                  accessibleLabel="고유무기 레벨"
                  value={settings.weaponLevel}
                  min={resolved.weaponStar > 0 ? 1 : 0}
                  max={Math.max(resolved.weaponStar > 0 ? 1 : 0, weaponLevelMax)}
                  valueLabel={
                    resolved.weaponStar === 0
                      ? "미개방"
                      : settings.weaponLevel === null
                        ? "설정값 없음"
                        : `Lv.${settings.weaponLevel}`
                  }
                  disabled={resolved.weaponStar === 0}
                  onChange={(value) => onChange("weaponLevel", value)}
                />
              ) : (
                <p className="text-xs text-muted-foreground">고유무기 자료 없음</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="comparison-growth-skills-title">
          <h3 id="comparison-growth-skills-title" className="text-sm font-semibold text-foreground">
            스킬
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            {skillFields.map(({ slot, field, label }) => {
              const maxValue = skillMaxBySlot.get(slot);
              const value = settings[field];
              return maxValue ? (
                <SettingSlider
                  key={field}
                  title={label}
                  accessibleLabel={label}
                  value={value}
                  valueLabel={value === null ? "" : String(value)}
                  min={1}
                  max={maxValue}
                  onChange={(nextValue) => onChange(field, nextValue)}
                />
              ) : (
                <p key={field} className="self-end text-xs text-muted-foreground">
                  {label} 자료 없음
                </p>
              );
            })}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="comparison-growth-equipment-title">
          <h3 id="comparison-growth-equipment-title" className="text-sm font-semibold text-foreground">
            장비
          </h3>
          <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
            {equipmentFields.map(({ tier: tierField, level: levelField }, index) => {
              const category = student.equipments[index] ?? null;
              const label = category ? (EQUIPMENT_TYPE_LABELS[category] ?? `장비 ${index + 1}`) : `장비 ${index + 1}`;
              const titleId = `comparison-growth-equipment-${index}-title`;
              const maxTier = getStudentComparisonEquipmentMaxTier(source, catalog, index);
              const selectedTier = settings[tierField];
              const selectedEquipment =
                category && selectedTier !== null
                  ? catalog.equipment.find(
                      (equipment) => equipment.category === category && equipment.tier === selectedTier,
                    )
                  : undefined;
              const selectedLevel = settings[levelField];
              const locked = resolved.level < getEquipmentSlotUnlockLevel(index);
              const missing =
                category === null || !catalog.equipment.some((equipment) => equipment.category === category);
              return (
                <Fragment key={tierField}>
                  {/* biome-ignore lint/a11y/useSemanticElements: A fieldset legend straddles the padded card edge; group controls by the visible heading instead. */}
                  <div role="group" aria-labelledby={titleId} className="min-w-0 space-y-2 rounded-md bg-muted/40 p-3">
                    <h4 id={titleId} className="text-sm font-medium text-foreground">
                      {label}
                    </h4>
                    {missing ? (
                      <p className="text-xs text-muted-foreground">장비 카탈로그 자료 없음</p>
                    ) : (
                      <>
                        <SettingSlider
                          title="티어"
                          accessibleLabel={`${label} 티어`}
                          value={selectedTier}
                          valueLabel={selectedTier === null ? "" : `T${selectedTier}`}
                          min={1}
                          max={maxTier}
                          disabled={locked}
                          onChange={(value) => onChange(tierField, value)}
                        />
                        {locked ? (
                          <p className="text-xs text-muted-foreground">
                            학생 Lv.{getEquipmentSlotUnlockLevel(index)}부터 적용
                          </p>
                        ) : null}
                        {selectedEquipment ? (
                          <SettingSlider
                            title="레벨"
                            accessibleLabel={`${label} 레벨`}
                            value={selectedLevel}
                            valueLabel={selectedLevel === null ? "" : `Lv.${selectedLevel}`}
                            min={1}
                            max={selectedEquipment.maxLevel}
                            disabled={locked}
                            onChange={(value) => onChange(levelField, value)}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {selectedTier === null ? "장비 티어를 확인해 주세요." : `T${selectedTier} 장비 자료 없음`}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </Fragment>
              );
            })}
            {/* biome-ignore lint/a11y/useSemanticElements: A fieldset legend straddles the padded card edge; group controls by the visible heading instead. */}
            <div
              role="group"
              aria-labelledby="comparison-growth-special-gear-title"
              className="min-w-0 space-y-2 rounded-md bg-muted/40 p-3"
            >
              <h4 id="comparison-growth-special-gear-title" className="text-sm font-medium text-foreground">
                애용품
              </h4>
              {student.catalog?.gear ? (
                gearTiers.length > 0 ? (
                  <>
                    <SettingSlider
                      title="티어"
                      accessibleLabel="애용품 티어"
                      value={settings.equipSpecial}
                      valueLabel={settings.equipSpecial === null ? "" : `T${settings.equipSpecial}`}
                      min={0}
                      max={Math.max(0, ...gearTiers.map((tier) => tier.tier))}
                      onChange={(value) => onChange("equipSpecial", value)}
                    />
                    {settings.equipSpecial !== null && gearLocked ? (
                      <p className="text-xs text-muted-foreground">인연 Lv.{selectedGear?.openFavorLevel}부터 적용</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">애용품 단계 자료 없음</p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">애용품 자료 없음</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="comparison-growth-extra-title">
          <h3 id="comparison-growth-extra-title" className="text-sm font-semibold text-foreground">
            추가 성장
          </h3>
          {abilityReleaseReason ? (
            <p className="text-xs text-muted-foreground">능력 개방 미적용 · {abilityReleaseReason}</p>
          ) : null}
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {(
              [
                { field: "abilityHp", label: "최대 체력" },
                { field: "abilityAtk", label: "공격력" },
                { field: "abilityHeal", label: "치유력" },
              ] as const
            ).map(({ field, label }) => (
              <SettingSlider
                key={field}
                title={label}
                accessibleLabel={`능력 개방 ${label}`}
                value={settings[field]}
                valueLabel={settings[field] === null ? "" : String(settings[field])}
                min={0}
                max={25}
                disabled={abilityReleaseReason !== null}
                onChange={(value) => onChange(field, value)}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">
        <Button text="초기화" size="xs" variant="danger-subtle" className="min-w-16" onClick={onReset} />
        {onClose ? <Button text="완료" size="xs" variant="inverse" className="min-w-16" onClick={onClose} /> : null}
      </div>
    </div>
  );
}
