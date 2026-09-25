import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import WalkthroughPartyFormationEditor from "~/components/features/walkthrough-timeline/WalkthroughPartyFormationEditor";
import {
  resizeWalkthroughParty,
  toggleStartingSkillStudentUid,
  WalkthroughPartyGrowthEditor,
} from "~/components/features/walkthrough-timeline/WalkthroughPartyFormationEditor";
import type { WalkthroughParty } from "~/domain/walkthrough-timeline";
import { getWalkthroughEquipmentLabel } from "~/components/features/walkthrough-timeline/walkthrough-equipment-label";

function tenPersonParty(): WalkthroughParty {
  return {
    uid: "party-1",
    order: 0,
    startingSkillStudentUids: ["s0", "s1", "s2", "s3", "s6", "s7", "s4"],
    units: Array.from({ length: 10 }, (_, slot) => ({ slot, studentUid: `s${slot}` })),
    steps: [],
  };
}

describe("walkthrough party formation layout", () => {
  it("uses the available content width to choose the ten-person formation columns", () => {
    const markup = renderToStaticMarkup(
      <WalkthroughPartyFormationEditor
        party={tenPersonParty()}
        partySize={10}
        students={[]}
        recruitedSnapshots={{}}
        onChange={() => {}}
      />,
    );

    expect(markup).toContain("@container w-full min-w-0 sm:max-w-[34rem]");
    expect(markup).toContain("@min-[544px]:grid-cols-10");
    expect(markup).not.toContain("md:grid-cols-10");
    expect(markup).toContain('aria-label="스트라이커 편성"');
    expect(markup).toContain('aria-label="스페셜 편성"');
  });
});

describe("resizeWalkthroughParty starting skills", () => {
  it("keeps the existing order, removes students outside a six-person roster, then enforces the five-skill limit", () => {
    const resized = resizeWalkthroughParty(tenPersonParty(), 10, 6);

    expect(resized.units.map((unit) => [unit.slot, unit.studentUid])).toEqual([
      [0, "s0"],
      [1, "s1"],
      [2, "s2"],
      [3, "s3"],
      [4, "s6"],
      [5, "s7"],
    ]);
    expect(resized.startingSkillStudentUids).toEqual(["s0", "s1", "s2", "s3", "s6"]);
  });
});

describe("staged starting-skill selection", () => {
  it("appends in tap order, removes and renumbers later entries, and enforces the size limit", () => {
    const initialOrder = ["s0", "s1", "s2"];
    const afterAppend = toggleStartingSkillStudentUid(initialOrder, "s3", 5);
    const afterRemove = toggleStartingSkillStudentUid(afterAppend, "s1", 5);
    const atLimit = toggleStartingSkillStudentUid(["s0", "s1", "s2", "s3", "s4"], "s5", 5);

    expect(afterAppend).toEqual(["s0", "s1", "s2", "s3"]);
    expect(afterRemove).toEqual(["s0", "s2", "s3"]);
    expect(atLimit).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    expect(initialOrder).toEqual(["s0", "s1", "s2"]);
  });
});

describe("walkthrough equipment labels", () => {
  it("maps the student's ordered equipment categories and uses an explicit fallback for missing metadata", () => {
    expect(getWalkthroughEquipmentLabel(["shoes", "gloves", "bag"], 0)).toBe("신발");
    expect(getWalkthroughEquipmentLabel(["shoes", "gloves", "bag"], 1)).toBe("장갑");
    expect(getWalkthroughEquipmentLabel(["shoes", "gloves", "bag"], 2)).toBe("가방");
    expect(getWalkthroughEquipmentLabel(["unknown-category"], 1)).toBe("장비 정보 없음");
    expect(getWalkthroughEquipmentLabel(undefined, 0)).toBe("장비 정보 없음");
  });

  it("shows per-student equipment categories beside the editable level fields", () => {
    const party: WalkthroughParty = {
      uid: "party-equipment",
      order: 0,
      startingSkillStudentUids: [],
      units: [{ slot: 0, studentUid: "student-1", snapshot: { tier: 3 } }],
      steps: [],
    };
    const markup = renderToStaticMarkup(
      <WalkthroughPartyGrowthEditor
        party={party}
        students={[
          {
            uid: "student-1",
            name: "학생 이름",
            initialTier: 3,
            role: "striker",
            equipments: ["shoes", "gloves", "bag"],
          },
        ]}
        onChange={() => {}}
      />,
    );

    expect(markup).toContain("신발");
    expect(markup).toContain("장갑");
    expect(markup).toContain("가방");
    expect(markup).toContain("학생 이름 신발 레벨");
    expect(markup).not.toContain("1슬롯");
    expect(markup).not.toContain("2슬롯");
    expect(markup).not.toContain("3슬롯");
  });
});
