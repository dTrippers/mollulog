import { HeartIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { NumberInput, Toggle } from "~/components/primitives";
import { RELATIONSHIP_EXP_TABLE } from "~/models/constants";

type StudentRelationshipLevelProps = {
  currentExp: number | null;
  currentLevel: number;
  targetLevel: number;
  selectedItemExp: number;

  onCurrentLevelUpdate: ({ level, exp }: { level: number; exp: number | null }) => void;
  onTargetLevelUpdate: (level: number) => void;
};

export default function StudentRelationshipLevel({
  currentExp: currentExpProp,
  currentLevel,
  targetLevel,
  selectedItemExp,
  onCurrentLevelUpdate,
  onTargetLevelUpdate,
}: StudentRelationshipLevelProps) {
  const currentExp = useMemo(
    () => currentExpProp ?? getAccumulatedExpForLevel(currentLevel),
    [currentExpProp, currentLevel],
  );

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
            <div className="w-full">
              {useCurrentExp ? (
                <>
                  <NumberInput
                    label="현재 경험치"
                    value={currentExp}
                    minValue={0}
                    size="lg"
                    onChange={(value) => onCurrentLevelUpdate({ level: getLevelForExp(value), exp: value })}
                  />
                  <p className="mt-1 truncate text-left text-xs text-neutral-500 dark:text-neutral-400 md:text-center">
                    {getLevelForExp(currentExp)} 랭크
                  </p>
                </>
              ) : (
                <>
                  <NumberInput
                    label="현재 랭크"
                    value={currentLevel}
                    minValue={1}
                    maxValue={100}
                    size="lg"
                    onChange={(value) => onCurrentLevelUpdate({ level: value, exp: null })}
                  />
                  <p className="mt-1 truncate text-left text-xs text-neutral-500 dark:text-neutral-400 md:text-center">
                    {getAccumulatedExpForLevel(currentLevel).toLocaleString()} EXP
                  </p>
                </>
              )}
            </div>
            <div className="w-full">
              <NumberInput
                label="목표 랭크"
                value={targetLevel}
                minValue={1}
                maxValue={100}
                size="lg"
                onChange={(value) => onTargetLevelUpdate(value)}
              />
            </div>
          </div>
          <ExpectedLevelSummary expectedLevel={expectedLevel} expectedExp={expectedExp} requiredExp={requiredExp} />
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
