import { describe, expect, it } from "@jest/globals";
import { getToolMessage } from "~/components/features/events/treasure-hunt/TreasureHuntSimulator";
import { treasureHuntLocale } from "~/locales/ko";

const baseMessage = {
  analysisStatus: "ok",
  complete: false,
  invalidCell: null,
  placement: null,
  lastRecordedTreasure: null,
  selectedTreasure: null,
};

describe("treasure hunt board tool message", () => {
  it("shows the last recorded treasure until another action supersedes it", () => {
    expect(getToolMessage({ ...baseMessage, lastRecordedTreasure: { width: 3, height: 2 } }).text).toBe(
      treasureHuntLocale.treasureRecorded(3, 2),
    );
  });

  it("keeps completion and invalid-placement messages ahead of the record confirmation", () => {
    const lastRecordedTreasure = { width: 3, height: 2 };

    expect(getToolMessage({ ...baseMessage, lastRecordedTreasure, complete: true }).text).toBe(
      treasureHuntLocale.allTreasuresFound,
    );
    expect(
      getToolMessage({
        ...baseMessage,
        lastRecordedTreasure,
        invalidCell: { x: 0, y: 0, failure: "overlap" },
      }).text,
    ).toBe(treasureHuntLocale.placementOverlap);
  });

  it("keeps the default visible help text when no treasure was recorded", () => {
    expect(getToolMessage(baseMessage).text).toBe(treasureHuntLocale.emptyBoardHelp);
  });
});
