import { HeartIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { RELATIONSHIP_EXP_TABLE } from "~/models/constants";
import { sanitizeClassName } from "~/prophandlers";
import { Toggle } from "~/components/primitives";

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
    <section className="mb-3 md:mb-4">
      <div className="rounded-lg border border-border bg-card p-3 md:p-4">
        <div className="mb-3 min-w-0">
          <h2 className="text-lg font-semibold text-foreground">인연 랭크</h2>
          <p className="text-xs text-muted-foreground">현재 경험치를 알고 있다면 더 정확하게 계산할 수 있어요</p>
          <div className="mt-2">
            <Toggle label="EXP 입력" initialState={useCurrentExp} onChange={setUseCurrentExp} />
          </div>
        </div>

        <div className="rounded-lg bg-muted/60 p-2.5 md:p-4">
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            {useCurrentExp ?
              <LevelInput
                label="현재 경험치"
                value={currentExp}
                onChange={(value) => onCurrentLevelUpdate({ level: getLevelForExp(value), exp: value })}
                helperText={`${getLevelForExp(currentExp)} 랭크`}
                minValue={0}
                icon="exp"
              /> :
              <LevelInput
                label="현재 랭크"
                value={currentLevel}
                onChange={(value) => onCurrentLevelUpdate({ level: value, exp: null })}
                helperText={`${getAccumulatedExpForLevel(currentLevel).toLocaleString()} EXP`}
                minValue={1}
                maxValue={100}
                icon="heart"
              />}
            <LevelInput
              label="목표 랭크"
              value={targetLevel}
              onChange={(value) => onTargetLevelUpdate(value)}
              minValue={1}
              maxValue={100}
              icon="heart"
            />
          </div>
          <ExpectedLevelSummary
            expectedLevel={expectedLevel}
            expectedExp={expectedExp}
            requiredExp={requiredExp}
          />
        </div>
      </div>
    </section>
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
  helperText?: string;

  icon: "heart" | "exp";
};

function LevelInput({ label, value, minValue, maxValue, onChange, helperText, icon }: LevelInputProps) {
  const [internalValue, setInternalValue] = useState(value);
  const inputId = `${icon}-${label.replace(/\s+/g, "-")}`;

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300 md:text-sm">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          className={sanitizeClassName(`
            w-full rounded-md border border-neutral-300 bg-white py-1.5 pr-2 pl-8 text-center text-base font-semibold text-neutral-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100
            md:py-2 md:pr-3 md:pl-10 md:text-lg [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]
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
        />
        {icon === "heart" && <HeartIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 transform text-neutral-600 dark:text-neutral-400 md:left-3" />}
        {icon === "exp" && <span className="absolute top-1/2 left-2 -translate-y-1/2 transform text-xs font-extrabold text-neutral-600 dark:text-neutral-400 md:left-3 md:text-sm">EXP</span>}
      </div>
      {helperText && <p className="mt-1 truncate text-left text-xs text-neutral-500 dark:text-neutral-400 md:text-center">{helperText}</p>}
    </div>
  );
}

function ExpectedLevelSummary({
  expectedLevel,
  expectedExp,
  requiredExp,
}: {
  expectedLevel: number;
  expectedExp: number;
  requiredExp: number;
}) {
  const nextRankExp = expectedLevel === 100 ? 0 : getAccumulatedExpForLevel(expectedLevel + 1) - expectedExp;

  return (
    <div className="mt-2 grid grid-cols-3 divide-x divide-border/70 rounded-md border border-border bg-background md:mt-3">
      <div className="min-w-0 px-2 py-2 md:px-3">
        <p className="text-xs font-medium text-muted-foreground">선물 후 랭크</p>
        <p className="mt-1 flex items-center gap-1 text-base font-bold leading-none text-foreground md:text-xl">
          <HeartIcon className="size-4 text-rose-500" />
          {expectedLevel}
        </p>
      </div>
      <div className="min-w-0 px-2 py-2 md:px-3">
        <p className="text-xs font-medium text-muted-foreground">다음 랭크까지</p>
        <p className="mt-1 truncate text-xs font-bold leading-none text-foreground sm:text-sm md:text-lg">
          {expectedLevel === 100 ? "최고 랭크" : `${nextRankExp.toLocaleString()} EXP`}
        </p>
      </div>
      <div className="min-w-0 px-2 py-2 md:px-3">
        <p className="text-xs font-medium text-muted-foreground">목표 랭크까지</p>
        <p className="mt-1 truncate text-xs font-bold leading-none text-foreground sm:text-sm md:text-lg">
          {requiredExp <= 0 ? "도달 완료" : `${requiredExp.toLocaleString()} EXP`}
        </p>
      </div>
    </div>
  );
}
