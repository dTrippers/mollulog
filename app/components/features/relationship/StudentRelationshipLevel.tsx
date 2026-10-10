import { HeartIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { NumberInput, SectionCard, Toggle } from "~/components/primitives";
import { getAccumulatedRelationshipExpForLevel, RELATIONSHIP_EXP_TABLE } from "~/domain/relationship-level";

type StudentRelationshipLevelProps = {
  currentExp: number | null;
  currentLevel: number | null;
  targetLevel: number | null;
  studentName: string;
  selectedItemExp: number;

  onCurrentLevelUpdate: ({ level, exp }: { level: number | null; exp: number | null }) => void;
  onTargetLevelUpdate: (level: number | null) => void;
};

export default function StudentRelationshipLevel({
  currentExp: currentExpProp,
  currentLevel,
  targetLevel,
  studentName,
  selectedItemExp,
  onCurrentLevelUpdate,
  onTargetLevelUpdate,
}: StudentRelationshipLevelProps) {
  const canCalculate = currentLevel != null && targetLevel != null;
  const currentExp = useMemo(() => {
    if (currentExpProp != null) return currentExpProp;
    if (currentLevel == null) return null;
    return getAccumulatedRelationshipExpForLevel(currentLevel);
  }, [currentExpProp, currentLevel]);
  const expectedExp = canCalculate && currentExp != null ? currentExp + selectedItemExp : null;
  const expectedLevel = useMemo(() => (expectedExp == null ? null : getLevelForExp(expectedExp) || 100), [expectedExp]);

  const [useCurrentExp, setUseCurrentExp] = useState(currentExpProp !== null);
  useEffect(() => {
    setUseCurrentExp(currentExpProp !== null);
  }, [currentExpProp]);

  const requiredExp =
    targetLevel == null || expectedExp == null
      ? null
      : getAccumulatedRelationshipExpForLevel(targetLevel) - expectedExp;
  const nextRankExp =
    expectedLevel == null || expectedExp == null || expectedLevel === 100
      ? 0
      : getAccumulatedRelationshipExpForLevel(expectedLevel + 1) - expectedExp;

  return (
    <SectionCard
      title="인연 랭크"
      description="현재 경험치를 알고 있다면 더 정확하게 계산할 수 있어요"
      action={<Toggle label="EXP 입력" initialState={useCurrentExp} className="my-0" onChange={setUseCurrentExp} />}
      className="mb-3 md:mb-4"
    >
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <div>
          {useCurrentExp ? (
            <NumberInput
              label="현재 경험치"
              value={currentExp}
              nullable
              inputProps={{ "aria-label": `${studentName} 현재 경험치` }}
              minValue={0}
              size="lg"
              fullWidth
              onChange={(value) =>
                onCurrentLevelUpdate({
                  level: value == null ? currentLevel : getLevelForExp(value),
                  exp: value,
                })
              }
            />
          ) : (
            <NumberInput
              label="현재 랭크"
              value={currentLevel}
              nullable
              inputProps={{ "aria-label": `${studentName} 현재 랭크` }}
              minValue={1}
              maxValue={100}
              size="lg"
              fullWidth
              onChange={(value) => onCurrentLevelUpdate({ level: value, exp: null })}
            />
          )}
          <p className="mt-1 truncate text-left text-xs text-neutral-500 dark:text-neutral-400 md:text-center">
            {currentLevel == null ? (
              <span className="opacity-40" aria-hidden="true">
                -
              </span>
            ) : useCurrentExp ? (
              `${currentExp == null ? "-" : getLevelForExp(currentExp)} 랭크`
            ) : (
              `${getAccumulatedRelationshipExpForLevel(currentLevel ?? 1).toLocaleString()} EXP`
            )}
          </p>
        </div>

        {
          <NumberInput
            label="목표 랭크"
            value={targetLevel}
            nullable
            inputProps={{ "aria-label": `${studentName} 목표 랭크` }}
            minValue={1}
            maxValue={100}
            size="lg"
            fullWidth
            onChange={onTargetLevelUpdate}
          />
        }
      </div>

      <fieldset
        className={`mt-2 grid grid-cols-3 divide-x divide-border/70 rounded-md bg-muted md:mt-3 min-w-0 border-0 p-0`}
        aria-label={!canCalculate ? "계산 보류" : undefined}
      >
        <div className="min-w-0 px-2 py-2 text-center md:px-3">
          <p className="text-xs font-medium text-muted-foreground">선물 후 랭크</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-base font-bold leading-none text-foreground md:text-xl">
            <HeartIcon className="size-4 text-rose-500" />
            {!canCalculate ? (
              <span className="opacity-40" aria-hidden="true">
                -
              </span>
            ) : (
              expectedLevel
            )}
          </p>
        </div>
        <div className="min-w-0 px-2 py-2 text-center md:px-3">
          <p className="text-xs font-medium text-muted-foreground">다음 랭크까지</p>
          <p className="mt-1 truncate text-xs font-bold leading-none text-foreground sm:text-sm md:text-lg">
            {!canCalculate ? (
              <span className="opacity-40" aria-hidden="true">
                -
              </span>
            ) : expectedLevel === 100 ? (
              "최고 랭크"
            ) : (
              `${nextRankExp.toLocaleString()} EXP`
            )}
          </p>
        </div>
        <div className="min-w-0 px-2 py-2 text-center md:px-3">
          <p className="text-xs font-medium text-muted-foreground">목표 랭크까지</p>
          <p className="mt-1 truncate text-xs font-bold leading-none text-foreground sm:text-sm md:text-lg">
            {!canCalculate ? (
              <span className="opacity-40" aria-hidden="true">
                -
              </span>
            ) : requiredExp != null && requiredExp <= 0 ? (
              "도달 완료"
            ) : (
              `${(requiredExp ?? 0).toLocaleString()} EXP`
            )}
          </p>
        </div>
      </fieldset>
    </SectionCard>
  );
}

function getLevelForExp(exp: number): number {
  const level = RELATIONSHIP_EXP_TABLE.find((entry) => entry.accumulatedExp > exp)?.level;
  if (level) {
    return level - 1;
  }
  return 0;
}
