/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RaidPartyView } from "~/components/v2/features/raid-records/RaidPartyView";
import { WalkthroughPartyThumbs } from "~/components/v2/features/walkthroughs/walkthrough-parts";
import type { RaidRecordParty } from "~/domain/raid-record";

const studentsByUid = new Map([
  ["10000", { name: "아루" }],
  ["10002", { name: "아코" }],
]);

function slotTexts(groupLabel: string): string[] {
  return within(screen.getByRole("list", { name: groupLabel }))
    .getAllByRole("listitem")
    .map((item) => (item.textContent?.includes("비어 있음") ? "empty" : (item.textContent ?? "")));
}

describe("saved party slots", () => {
  it("keeps the empty slots of a record's party in place", () => {
    const party = {
      units: [
        { slot: 2, studentUid: "10000", assist: false, snapshot: {} },
        { slot: 5, studentUid: "10002", assist: false, snapshot: {} },
      ],
    } as unknown as RaidRecordParty;
    render(
      <MemoryRouter>
        <RaidPartyView party={party} title="1파티" studentsByUid={studentsByUid} />
      </MemoryRouter>,
    );

    const strikers = slotTexts("STRIKER");
    expect(strikers).toHaveLength(4);
    expect(strikers[0]).toBe("empty");
    expect(strikers[1]).toBe("empty");
    expect(strikers[2]).toContain("아루");
    expect(strikers[3]).toBe("empty");
    const specials = slotTexts("SPECIAL");
    expect(specials[0]).toBe("empty");
    expect(specials[1]).toContain("아코");
  });

  it("keeps the empty slots of a guide's party in place", () => {
    render(
      <MemoryRouter>
        <WalkthroughPartyThumbs
          party={{
            units: [
              { slot: 2, studentUid: "10000" },
              { slot: 4, studentUid: "10002" },
            ],
            startingSkillStudentUids: [],
          }}
          partySize={6}
          studentsByUid={studentsByUid as never}
          groupLabels
          label="파티 1 편성"
        />
      </MemoryRouter>,
    );

    const strikers = slotTexts("STRIKER");
    expect(strikers.map((text) => (text === "empty" ? text : "student"))).toEqual([
      "empty",
      "empty",
      "student",
      "empty",
    ]);
    const specials = slotTexts("SPECIAL");
    expect(specials[0]).toContain("아코");
    expect(specials[1]).toBe("empty");
  });
});
