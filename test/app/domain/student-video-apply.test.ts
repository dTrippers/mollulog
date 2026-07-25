import { describe, expect, it } from "@jest/globals";
import { buildStudentVideoSyncDraftEntries } from "~/domain/student-video-apply";
import fixture from "../../fixtures/student-detail-video-result.v1.json";

describe("student video selective apply adapter", () => {
  it("maps relationship rank to bond and preserves confirmed recognized zero values", () => {
    const entries = buildStudentVideoSyncDraftEntries(
      fixture,
      {
        students: [
          {
            studentUid: "10000",
            current: {
              tier: 7,
              bond: 33,
              weaponLevel: 0,
              abilityHp: 0,
              abilityAtk: 0,
              abilityHeal: 0,
            },
            confirmedFields: ["tier", "bond", "weaponLevel", "abilityHp", "abilityAtk", "abilityHeal"],
          },
        ],
      },
      new Set(["10000"]),
    );

    const value = JSON.parse(entries[0].valueJson as string);
    expect(value).toEqual({
      current: {
        tier: 7,
        bond: 33,
        level: null,
        weaponLevel: 0,
        skillEx: null,
        skillNormal: null,
        skillEnhanced: null,
        skillSub: null,
        equip1: null,
        equip2: null,
        equip3: null,
        equipSpecial: null,
        abilityHp: 0,
        abilityAtk: 0,
        abilityHeal: 0,
      },
      target: null,
    });
    expect(entries[0].meta).toMatchObject({
      confirmedFields: ["tier", "bond", "weaponLevel", "abilityHp", "abilityAtk", "abilityHeal"],
      fields: {
        bond: { ocrValue: 32, submittedValue: 33, corrected: true },
        weaponLevel: { ocrValue: 0, submittedValue: 0, corrected: false },
      },
    });
  });

  it("allows manually corrected unknown and conflict fields", () => {
    const entries = buildStudentVideoSyncDraftEntries(
      fixture,
      {
        students: [
          {
            studentUid: "10000",
            current: { tier: 7, skillSub: 8, equip3: 9 },
            confirmedFields: ["tier", "skillSub", "equip3"],
          },
        ],
      },
      new Set(["10000"]),
    );

    expect(JSON.parse(entries[0].valueJson as string).current).toMatchObject({
      tier: 7,
      skillSub: 8,
      equip3: 9,
    });
    expect(entries[0].meta).toMatchObject({
      fields: {
        skillSub: { ocrValue: null, submittedValue: 8, corrected: true },
        equip3: { ocrValue: null, submittedValue: 9, corrected: true },
      },
    });
  });

  it("does not allow not-applicable fields to be confirmed", () => {
    for (const field of ["skillEnhanced", "equipSpecial"]) {
      expect(() =>
        buildStudentVideoSyncDraftEntries(
          fixture,
          {
            students: [
              {
                studentUid: "10000",
                current: { tier: 7, [field]: 1 },
                confirmedFields: ["tier", field],
              },
            ],
          },
          new Set(["10000"]),
        ),
      ).toThrow("미장착 상태라 반영할 수 없어요");
    }
  });

  it("requires UID membership in both the result and current catalog", () => {
    expect(() =>
      buildStudentVideoSyncDraftEntries(
        fixture,
        {
          students: [{ studentUid: "10000", current: { tier: 7 }, confirmedFields: ["tier"] }],
        },
        new Set(),
      ),
    ).toThrow("현재 학생 목록");
    expect(() =>
      buildStudentVideoSyncDraftEntries(
        fixture,
        {
          students: [{ studentUid: "other", current: { tier: 7 }, confirmedFields: ["tier"] }],
        },
        new Set(["other"]),
      ),
    ).toThrow("인식 결과에 없는 학생");
  });
});
