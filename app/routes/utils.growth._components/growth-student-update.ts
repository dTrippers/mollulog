import type { GrowthStudent } from "./types";

/**
 * Applies a row response to the student the screen holds. The response's resource requirements are kept only when it
 * has them, and the position stays the screen's: a response read before a move carries the old position.
 */
export function mergeGrowthStudentUpdate(current: GrowthStudent, next: GrowthStudent): GrowthStudent {
  return {
    ...next,
    resourceRequirements: next.resourceRequirements ?? current.resourceRequirements,
    plannerPosition: current.plannerPosition,
  };
}
