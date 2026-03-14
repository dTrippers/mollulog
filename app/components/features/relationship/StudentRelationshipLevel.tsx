import { ChevronRightIcon, HeartIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { RELATIONSHIP_EXP_TABLE } from "~/models/constants";
import { sanitizeClassName } from "~/prophandlers";
import { Section, Toggle } from "~/components/primitives";

type StudentRelationshipLevelProps = {
  currentExp: number | null;
  currentLevel: number;
  targetLevel: number;
  selectedItemExp: number;

  onCurrentLevelUpdate: ({ level, exp }: { level: number, exp: number | null }) => void;
  onTargetLevelUpdate: (level: number) => void;
};

export default function StudentRelationshipLevel({
  currentExp: currentExpProp, currentLevel, targetLevel, selectedItemExp, onCurrentLevelUpdate, onTargetLevelUpdate,
}: StudentRelationshipLevelProps) {
  const currentExp = useMemo(() => currentExpProp ?? getAccumulatedExpForLevel(currentLevel), [currentExpProp, currentLevel]);

  const expectedExp = currentExp + selectedItemExp;
  const expectedLevel = useMemo(() => getLevelForExp(expectedExp) || 100, [expectedExp]);

  const [useCurrentExp, setUseCurrentExp] = useState(currentExpProp !== null);
  useEffect(() => {
    setUseCurrentExp(currentExpProp !== null);
  }, [currentExpProp]);

  const requiredExp = getAccumulatedExpForLevel(targetLevel) - expectedExp;

  return (
    <Section title="인연 랭크" description="현재 경험치를 알고 있다면 더 정확하게 계산할 수 있어요">
      <Toggle label="현재 경험치로 입력" initialState={useCurrentExp} onChange={setUseCurrentExp} />
      <div className="p-4 bg-neutral-100 dark:bg-neutral-900 rounded-xl">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {useCurrentExp ?
            <LevelInput
              label="현재 경험치"
              value={currentExp}
              onChange={(value) => onCurrentLevelUpdate({ level: getLevelForExp(value), exp: value })}
              expLabel={`${getLevelForExp(currentExp)} 랭크`}
              minValue={0}
              icon="exp"
            /> :
            <LevelInput
              label="현재 랭크"
              value={currentLevel}
              onChange={(value) => onCurrentLevelUpdate({ level: value, exp: null })}
              expLabel={`${getAccumulatedExpForLevel(currentLevel).toLocaleString()} EXP`}
              minValue={1}
              maxValue={100}
              icon="heart"
            />}
          <ChevronRightIcon className="hidden md:block mt-2 size-6 text-neutral-500 dark:text-neutral-400 shrink-0" strokeWidth={2} />
          <LevelInput
            label="선물 후 랭크"
            value={expectedLevel}
            expLabel={expectedLevel === 100 ? "최고 랭크에 도달했어요" : `다음 랭크까지 +${(getAccumulatedExpForLevel(expectedLevel + 1) - expectedExp).toLocaleString()} EXP`}
            minValue={1}
            maxValue={100}
            readOnly={true}
            icon="heart"
          />
          <ChevronRightIcon className="hidden md:block mt-2 size-6 text-neutral-500 dark:text-neutral-400 shrink-0" strokeWidth={2} />
          <LevelInput
            label="목표 랭크"
            value={targetLevel}
            onChange={(value) => onTargetLevelUpdate(value)}
            expLabel={requiredExp <= 0 ? "목표 랭크에 도달했어요" : `목표 랭크까지 +${requiredExp.toLocaleString()} EXP`}
            minValue={1}
            maxValue={100}
            icon="heart"
          />
        </div>
      </div>
    </Section>
  );
}

function getLevelForExp(exp: number): number {
  const level = RELATIONSHIP_EXP_TABLE.find((entry) => entry.accumulatedExp > exp)?.level;
  if (level) {
    return level - 1;
  }
  return 0;
}

function getAccumulatedExpForLevel(level: number): number {
  return RELATIONSHIP_EXP_TABLE.find((entry) => entry.level === level)?.accumulatedExp ?? 0;
}

type LevelInputProps = {
  label: string;
  value: number;
  minValue: number;
  maxValue?: number;

  onChange?: (value: number) => void;
  readOnly?: boolean;
  expLabel?: string;

  icon: "heart" | "exp";
};

function LevelInput({ label, value, minValue, maxValue, onChange, readOnly = false, expLabel, icon }: LevelInputProps) {
  const [internalValue, setInternalValue] = useState(value);
  const inputId = `${icon}-${label.replace(/\s+/g, "-")}`;

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  return (
    <div className="w-full sm:flex-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          className={sanitizeClassName(`
            w-full pl-10 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500
            text-center text-lg font-semibold appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]
            ${readOnly ? "bg-pink-50 dark:bg-pink-700 cursor-not-allowed" : "bg-white dark:bg-neutral-700"}
          `)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={internalValue}
          onChange={(e) => {
            const inputValue = e.target.value;
            // Only allow digits and remove leading zeros
            const digitsOnly = inputValue.replace(/[^0-9]/g, "");
            const cleanValue = digitsOnly.replace(/^0+/, "") || "0";
            let numValue = Number(cleanValue);

            if (numValue < minValue) numValue = minValue;
            if (maxValue && numValue > maxValue) numValue = maxValue;
            setInternalValue(numValue);
            onChange?.(numValue);
          }}
          readOnly={readOnly}
        />
        {icon === "heart" && <HeartIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-neutral-600 dark:text-neutral-400" />}
        {icon === "exp" && <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm font-extrabold text-neutral-600 dark:text-neutral-400">EXP</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 text-left md:text-center">
        {expLabel}
      </p>
    </div>
  );
}
