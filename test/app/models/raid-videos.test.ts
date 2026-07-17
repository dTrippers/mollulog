import { describe, expect, it } from "@jest/globals";
import { Defense } from "../../../app/graphql/graphql";
import { buildRaidYoutubeSearchUrl, getRaidVideoParties } from "../../../app/models/raid-videos";

describe("getRaidVideoParties", () => {
  const exactParties = [{ partyIndex: 0, slots: [] }];
  const sourceParties = [
    { partyIndex: 0, slots: [] },
    { partyIndex: 1, slots: [] },
  ];

  it("prefers the official rank formation when an exact match exists", () => {
    expect(
      getRaidVideoParties({
        rankMatch: { rank: 123, finalRank: 120, parties: exactParties },
        sourceParties: [{ source: "tl_search", parties: sourceParties }],
      }),
    ).toBe(exactParties);
  });

  it("uses a complete source formation without an exact rank match", () => {
    expect(getRaidVideoParties({ sourceParties: [{ source: "tl_search", parties: sourceParties }] })).toBe(
      sourceParties,
    );
  });
});

describe("buildRaidYoutubeSearchUrl", () => {
  it("builds a season search with official Japanese raid and defense type names", () => {
    const result = buildRaidYoutubeSearchUrl({
      raidType: "elimination",
      bossName: "ヒエロニムス",
      defenseType: Defense.Special,
      from: "2026-03-04",
      to: "2026-03-14",
    });

    expect(result).not.toBeNull();
    const url = new URL(result as string);
    expect(url.origin).toBe("https://www.youtube.com");
    expect(url.pathname).toBe("/results");
    expect(url.searchParams.get("search_query")).toBe(
      "大決戦 ヒエロニムス 特殊装甲 after:2026-03-04 before:2026-03-14",
    );
  });

  it("does not expose an incomplete search when required labels cannot be resolved", () => {
    expect(
      buildRaidYoutubeSearchUrl({
        raidType: "allied",
        bossName: "連合作戦",
        defenseType: Defense.Special,
        from: "2026-03-04",
        to: "2026-03-14",
      }),
    ).toBeNull();
  });
});
