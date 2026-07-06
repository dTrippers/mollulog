import { describe, expect, it } from "@jest/globals";
import { convertRawPartySlot, convertToTotalTier } from "../../../../app/lib/ranks/ranks";

describe("raid rank party conversion", () => {
  it("combines equipment and weapon tiers from a video party slot", () => {
    expect(
      convertRawPartySlot(
        {
          uid: "10085",
          level: 90,
          tier: 5,
          weaponTier: 4,
          isAssist: true,
        },
        2,
      ),
    ).toEqual({
      slotIndex: 2,
      tier: 9,
      level: 90,
      isAssist: true,
      studentUid: "10085",
    });
  });

  it("keeps an empty video party slot explicit", () => {
    expect(convertRawPartySlot(null, 4)).toEqual({
      slotIndex: 4,
      tier: null,
      level: null,
      isAssist: null,
      studentUid: null,
    });
  });

  it("converts stored equipment and weapon tiers to the combined tier", () => {
    expect(convertToTotalTier(5, 3)).toBe(8);
  });
});
