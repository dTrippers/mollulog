import { describe, expect, it } from "@jest/globals";
import { toUtcIso } from "~/lib/date-time";
import {
  buildFormUsageItems,
  formatRaidRecordDateRange,
} from "~/routes/students.$id._components/StudentRaidRecordList";

describe("formatRaidRecordDateRange", () => {
  it("omits the repeated year when a record stays in one year", () => {
    expect(formatRaidRecordDateRange(toUtcIso("2027-01-05T00:00:00Z"), toUtcIso("2027-01-12T00:00:00Z"), "UTC")).toBe(
      "2027/01/05 ~ 01/12",
    );
  });

  it("keeps both years when a record crosses into another year", () => {
    expect(formatRaidRecordDateRange(toUtcIso("2026-12-28T00:00:00Z"), toUtcIso("2027-01-04T00:00:00Z"), "UTC")).toBe(
      "2026/12/28 ~ 2027/01/04",
    );
  });
});

describe("buildFormUsageItems", () => {
  const hoshinoForms = [
    { uid: "10098", name: "호시노(무장)", tacticRole: "tank" as const },
    { uid: "10099", name: "호시노(무장)", tacticRole: "attacker" as const },
  ];

  it("keeps the form switch order and uses role labels when names match", () => {
    expect(
      buildFormUsageItems({
        forms: hoshinoForms,
        usage: [
          { studentUid: "10099", partyCount: 1, ratio: 0.004 },
          { studentUid: "10098", partyCount: 2, ratio: 0.996 },
        ],
        currentStudentUid: "10098",
      }),
    ).toEqual([
      { studentUid: "10098", label: "탱커", ratio: 0.996, current: true, percent: "99.6%" },
      { studentUid: "10099", label: "딜러", ratio: 0.004, current: false, percent: "0.4%" },
    ]);
  });

  it("uses form names when names differ and hides forms with no parties", () => {
    expect(
      buildFormUsageItems({
        forms: [
          { uid: "10097", name: "슌(수영복)", tacticRole: "attacker" },
          { uid: "10144", name: "슈에링(수영복)", tacticRole: "attacker" },
        ],
        usage: [
          { studentUid: "10097", partyCount: 0, ratio: 0 },
          { studentUid: "10144", partyCount: 1, ratio: 1 },
        ],
        currentStudentUid: "10144",
      }),
    ).toEqual([{ studentUid: "10144", label: "슈에링(수영복)", ratio: 1, current: true, percent: "100%" }]);
  });

  it("hides the row when no forms were used", () => {
    expect(
      buildFormUsageItems({
        forms: hoshinoForms,
        usage: hoshinoForms.map(({ uid }) => ({ studentUid: uid, partyCount: 0, ratio: 0 })),
        currentStudentUid: "10098",
      }),
    ).toEqual([]);
  });

  it("preserves the pre-deploy empty state and hides non-multiclass students", () => {
    expect(buildFormUsageItems({ forms: hoshinoForms, usage: [], currentStudentUid: "10098" })).toEqual([]);
    expect(
      buildFormUsageItems({
        forms: [{ uid: "10098", name: "호시노(무장)", tacticRole: "tank" }],
        usage: [{ studentUid: "10098", partyCount: 5, ratio: 1 }],
        currentStudentUid: "10098",
      }),
    ).toEqual([]);
  });

  it("shows rounded boundary labels when both forms were used", () => {
    expect(
      buildFormUsageItems({
        forms: hoshinoForms,
        usage: [
          { studentUid: "10098", partyCount: 1000, ratio: 0.9995 },
          { studentUid: "10099", partyCount: 1, ratio: 0.0005 },
        ],
        currentStudentUid: "10098",
      }).map(({ percent }) => percent),
    ).toEqual([">99.9%", "<0.1%"]);
  });
});
