import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Decimal from "decimal.js";

const mockSolve = jest.fn();
jest.mock("javascript-lp-solver", () => ({
  __esModule: true,
  default: { Solve: mockSolve },
}));

import {
  OPTIMIZATION_TIMEOUT_MS,
  OPTIMIZATION_TOLERANCE,
  optimizeStageRuns,
} from "../../../../../../../app/components/features/events/shop/calculations/optimization";
import type { StageInfo } from "../../../../../../../app/components/features/events/shop/calculations/types";

function stage(uid: string, entryAp: number, rewards: Record<string, number>): StageInfo {
  return {
    uid,
    index: uid,
    entryAp: new Decimal(entryAp),
    rewardPerItem: Object.fromEntries(
      Object.entries(rewards).map(([itemUid, amount]) => [itemUid, new Decimal(amount)]),
    ),
  };
}

beforeEach(() => {
  mockSolve.mockReset();
});

describe("bounded stage optimization", () => {
  it("passes the agreed tolerance and time limit to the solver", () => {
    mockSolve.mockReturnValue({ feasible: true, stage_a: 4 });

    optimizeStageRuns([stage("a", 10, { x: 3 })], [["x", 10]]);

    expect(mockSolve).toHaveBeenCalledWith(
      expect.objectContaining({
        tolerance: OPTIMIZATION_TOLERANCE,
        timeout: OPTIMIZATION_TIMEOUT_MS,
      }),
    );
    expect(OPTIMIZATION_TOLERANCE).toBe(0.001);
    expect(OPTIMIZATION_TIMEOUT_MS).toBe(700);
  });

  it("uses a feasible fallback instead of rounding a fractional timeout result", () => {
    mockSolve.mockReturnValue({ feasible: true, isIntegral: false, stage_a: 10 / 3 });

    const result = optimizeStageRuns([stage("a", 10, { x: 3 })], [["x", 10]]);

    expect(result.stageRuns).toEqual({ a: 4 });
    expect(result.totalAp.toNumber()).toBe(40);
  });

  it("rejects an integer solver result that does not satisfy every target", () => {
    mockSolve.mockReturnValue({ feasible: true, stage_a: 3 });

    const result = optimizeStageRuns([stage("a", 10, { x: 3 })], [["x", 10]]);

    expect(result.stageRuns).toEqual({ a: 4 });
    expect(result.totalAp.toNumber()).toBe(40);
  });

  it("keeps a valid solver plan when it improves on the fallback", () => {
    mockSolve.mockReturnValue({ feasible: true, stage_both: 1 });
    const stages = [stage("x", 10, { x: 10 }), stage("y", 10, { y: 10 }), stage("both", 15, { x: 10, y: 10 })];

    const result = optimizeStageRuns(stages, [
      ["x", 10],
      ["y", 10],
    ]);

    expect(result.stageRuns).toEqual({ both: 1 });
    expect(result.totalAp.toNumber()).toBe(15);
  });

  it("keeps the cheaper fallback when the bounded solver returns a worse valid plan", () => {
    mockSolve.mockReturnValue({ feasible: true, stage_x: 2, stage_y: 2 });
    const stages = [stage("x", 10, { x: 10 }), stage("y", 10, { y: 10 })];

    const result = optimizeStageRuns(stages, [
      ["x", 10],
      ["y", 10],
    ]);

    expect(result.stageRuns).toEqual({ x: 1, y: 1 });
    expect(result.totalAp.toNumber()).toBe(20);
  });

  it("uses the feasible fallback when the solver throws", () => {
    mockSolve.mockImplementation(() => {
      throw new Error("solver failed");
    });

    const result = optimizeStageRuns([stage("a", 10, { x: 3 })], [["x", 10]]);

    expect(result.stageRuns).toEqual({ a: 4 });
    expect(result.totalAp.toNumber()).toBe(40);
  });
});
