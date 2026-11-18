import { describe, expect, it } from "@jest/globals";
import { OcrPublicError } from "~/domain/ocr";
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
      providedFields: {
        current: ["tier", "bond", "weaponLevel", "abilityHp", "abilityAtk", "abilityHeal"],
        target: [],
      },
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

  it("names the confirmed field that breaks the growth rules for the tier", () => {
    const cases = [
      {
        current: { tier: 3, level: 90, weaponLevel: 1 },
        confirmedFields: ["tier", "level", "weaponLevel"],
        field: "weaponLevel",
      },
      {
        current: { tier: 5, abilityHp: 0, abilityAtk: 2 },
        confirmedFields: ["tier", "abilityHp", "abilityAtk"],
        field: "abilityAtk",
      },
      { current: { tier: 7, skillEx: 6 }, confirmedFields: ["tier", "skillEx"], field: "skillEx" },
      { current: { tier: 10 }, confirmedFields: ["tier"], field: "tier" },
    ];
    for (const { current, confirmedFields, field } of cases) {
      let thrown: unknown;
      try {
        buildStudentVideoSyncDraftEntries(
          fixture,
          { students: [{ studentUid: "10000", current, confirmedFields }] },
          new Set(["10000"]),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OcrPublicError);
      expect((thrown as OcrPublicError).details).toEqual({ reason: "growth_rule_violation", field });
    }
  });

  it("tags each rejection with a stable reason code", () => {
    const cases = [
      { request: {}, reason: "students_missing", field: undefined },
      {
        request: { students: [{ studentUid: "10000", current: { tier: 7 }, confirmedFields: ["level"] }] },
        reason: "tier_not_confirmed",
        field: "tier",
      },
      {
        request: { students: [{ studentUid: "10000", current: { tier: 7 }, confirmedFields: ["tier", "tier"] }] },
        reason: "confirmed_field_duplicated",
        field: "tier",
      },
      {
        request: {
          students: [{ studentUid: "10000", current: { tier: 7 }, confirmedFields: ["tier", "equipSpecial"] }],
        },
        reason: "field_not_equipped",
        field: "equipSpecial",
      },
      {
        request: {
          students: [{ studentUid: "10000", current: { tier: 7, level: "90" }, confirmedFields: ["tier", "level"] }],
        },
        reason: "field_value_not_integer",
        field: "level",
      },
      {
        request: { students: [{ studentUid: "10000", current: { tier: 7 }, confirmedFields: ["tier", "secret"] }] },
        reason: "confirmed_field_unknown",
        field: undefined,
      },
    ];
    for (const { request, reason, field } of cases) {
      let thrown: unknown;
      try {
        buildStudentVideoSyncDraftEntries(fixture, request, new Set(["10000"]));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OcrPublicError);
      expect((thrown as OcrPublicError).details).toEqual({ reason, field });
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
