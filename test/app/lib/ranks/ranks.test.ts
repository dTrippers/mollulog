import { describe, expect, it, jest } from "@jest/globals";
import { Defense } from "~/graphql/graphql";
import { fetchProtobuf } from "~/lib/ranks/base";
import { convertRawPartySlot, convertToTotalTier, fetchRanks } from "~/lib/ranks/ranks";

jest.mock("~/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "http://localhost:8080",
  createProtobufRootCache: jest.fn(() => jest.fn()),
  fetchProtobuf: jest.fn(),
}));

const mockedFetchProtobuf = jest.mocked(fetchProtobuf);

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

  it("sends exact parties in the rank request body", async () => {
    mockedFetchProtobuf.mockResolvedValue({ totalCount: 0, ranks: [] });

    await fetchRanks({
      raidType: "total_assault",
      season: 84,
      defenseType: Defense.Special,
      exactParties: [
        ["A", "B", "C", "D", "E", "F"],
        ["G", "H", "I", "J", "K", "L"],
      ],
      includeStudents: [],
      excludeStudents: [],
      perPage: 10,
      page: 1,
    });

    expect(mockedFetchProtobuf).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          perPage: 10,
          page: 1,
          includeStudents: [],
          excludeStudents: [],
          exactParties: [
            ["A", "B", "C", "D", "E", "F"],
            ["G", "H", "I", "J", "K", "L"],
          ],
        }),
      }),
    );
  });
});
