import { describe, expect, it } from "@jest/globals";
import {
  createBoardObservation,
  createTreasureHuntComposition,
  getPlacementFailure,
  getRemainingTreasureShapes,
  isObservationStructurallyValid,
  placementSize,
} from "~/components/features/events/treasure-hunt/board-utils";
import type { TreasureHuntRoundConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const round: TreasureHuntRoundConfig = {
  round: 1,
  boardWidth: 5,
  boardHeight: 3,
  cellCost: { resourceType: ResourceTypeEnum.Currency, resourceUid: "coin", quantity: 1 },
  openCellRewards: [],
  treasures: [
    { uid: "three-by-one", width: 3, height: 1, count: 2, rewards: [] },
    { uid: "one-by-two", width: 1, height: 2, count: 1, rewards: [] },
  ],
};

describe("treasure hunt board UI helpers", () => {
  it("keeps horizontal and vertical placement aligned with the game board", () => {
    expect(placementSize(3, 1, "horizontal")).toEqual({ width: 3, height: 1 });
    expect(placementSize(3, 1, "vertical")).toEqual({ width: 1, height: 3 });
    expect(placementSize(2, 2, "vertical")).toEqual({ width: 2, height: 2 });
  });

  it("builds worker inputs and counts remaining rotation-equivalent shapes", () => {
    const board = {
      round: 1,
      knownEmpty: [{ x: 4, y: 2 }],
      foundTreasures: [{ id: 1, x: 0, y: 0, width: 1, height: 3, orientation: "vertical" as const }],
    };

    expect(createTreasureHuntComposition(round)).toEqual({
      boardWidth: 5,
      boardHeight: 3,
      pieces: [
        { width: 3, height: 1, count: 2 },
        { width: 1, height: 2, count: 1 },
      ],
    });
    expect(createBoardObservation(board).foundTreasures).toEqual([
      { x: 0, y: 0, width: 1, height: 3, orientation: "vertical" },
    ]);
    expect(getRemainingTreasureShapes(round, board.foundTreasures)).toEqual([
      { width: 3, height: 1, total: 2, remaining: 1 },
      { width: 1, height: 2, total: 1, remaining: 1 },
    ]);
  });

  it("rejects placement over a known empty cell or beyond the board", () => {
    const board = { round: 1, knownEmpty: [{ x: 1, y: 1 }], foundTreasures: [] };
    expect(getPlacementFailure(round, board, { width: 3, height: 1, orientation: "horizontal" }, { x: 0, y: 1 })).toBe(
      "overlap",
    );
    expect(getPlacementFailure(round, board, { width: 3, height: 1, orientation: "horizontal" }, { x: 3, y: 0 })).toBe(
      "out-of-bounds",
    );
    expect(getPlacementFailure(round, board, { width: 3, height: 1, orientation: "vertical" }, { x: 4, y: 0 })).toBe(
      null,
    );
  });

  it("identifies restored observations that cannot be sent to the strict engine API", () => {
    const composition = createTreasureHuntComposition(round);
    expect(
      isObservationStructurallyValid(composition, {
        knownEmpty: [{ x: 0, y: 0 }],
        foundTreasures: [{ x: 0, y: 0, width: 3, height: 1, orientation: "horizontal" }],
      }),
    ).toBe(false);
    expect(
      isObservationStructurallyValid(composition, {
        knownEmpty: [],
        foundTreasures: [
          { x: 0, y: 0, width: 3, height: 1, orientation: "horizontal" },
          { x: 0, y: 2, width: 3, height: 1, orientation: "horizontal" },
          { x: 0, y: 1, width: 3, height: 1, orientation: "horizontal" },
        ],
      }),
    ).toBe(false);
  });
});
