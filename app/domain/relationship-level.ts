import { RELATIONSHIP_EXP_TABLE } from "~/models/constants";

export type RelationshipLevelInput = {
  currentLevel: number | null;
  targetLevel: number | null;
};

export function getAccumulatedRelationshipExpForLevel(level: number): number {
  return RELATIONSHIP_EXP_TABLE.find((entry) => entry.level === level)?.accumulatedExp ?? 0;
}

export function getRelationshipLevelValidationError(input: RelationshipLevelInput): string | null {
  const { currentLevel, targetLevel } = input;

  if (currentLevel != null && (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 100)) {
    return "현재 인연 랭크는 1부터 100 사이만 입력할 수 있어요";
  }

  if (targetLevel != null && (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 100)) {
    return "목표 인연 랭크는 1부터 100 사이만 입력할 수 있어요";
  }

  if (currentLevel != null && targetLevel != null && targetLevel < currentLevel) {
    return "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요";
  }

  return null;
}
