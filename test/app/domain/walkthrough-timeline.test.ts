import { describe, expect, it } from "@jest/globals";
import {
  InvalidWalkthroughTimelineDocumentError,
  parseWalkthroughTimelineDocument,
  type WalkthroughTimelineDocument,
} from "~/domain/walkthrough-timeline";

function validDocument(): WalkthroughTimelineDocument {
  return {
    type: "walkthrough_timeline",
    schemaVersion: 1,
    partySize: 6,
    context: { bossUid: "boss-1", defenseType: "heavy", maxDifficulty: "torment" },
    parties: [
      {
        uid: "party-1",
        order: 0,
        startingSkillStudentUids: [],
        units: [],
        steps: [
          {
            uid: "step-1",
            order: 0,
            kind: "actions",
            marker: { kind: "immediate", value: "즉시" },
            actions: [{ kind: "student_ex", studentUid: "student-1" }],
          },
        ],
      },
    ],
  };
}

describe("parseWalkthroughTimelineDocument", () => {
  it("accepts a version 1 walkthrough timeline", () => {
    expect(parseWalkthroughTimelineDocument(validDocument())).toEqual(validDocument());
  });

  it("rejects unknown schema versions instead of applying a fallback", () => {
    expect(() => parseWalkthroughTimelineDocument({ ...validDocument(), schemaVersion: 2 })).toThrow(
      InvalidWalkthroughTimelineDocumentError,
    );
  });

  it("rejects a student action without a student uid", () => {
    const document = validDocument();
    document.parties[0].steps[0].actions = [{ kind: "student_ex" }];
    expect(() => parseWalkthroughTimelineDocument(document)).toThrow("studentUid");
  });

  it("enforces the agreed party, step, and action limits", () => {
    const tooManyParties = validDocument();
    tooManyParties.parties = Array.from({ length: 21 }, (_, index) => ({
      uid: `party-${index}`,
      order: index,
      startingSkillStudentUids: [],
      units: [],
      steps: [],
    }));
    expect(() => parseWalkthroughTimelineDocument(tooManyParties)).toThrow("20개");

    const tooManyActions = validDocument();
    tooManyActions.parties[0].steps[0].actions = Array.from({ length: 21 }, (_, index) => ({
      kind: "student_ex" as const,
      studentUid: `student-${index}`,
    }));
    expect(() => parseWalkthroughTimelineDocument(tooManyActions)).toThrow("20개");
  });

  it("rejects duplicate party slots and students", () => {
    const duplicate = validDocument();
    duplicate.parties[0].units = [
      { slot: 0, studentUid: "student-1" },
      { slot: 0, studentUid: "student-1" },
    ];
    expect(() => parseWalkthroughTimelineDocument(duplicate)).toThrow("중복");
  });

  it("accepts a 10-student walkthrough and rejects slots outside its configured size", () => {
    const tenStudentParty = validDocument();
    tenStudentParty.partySize = 10;
    tenStudentParty.parties[0].units = Array.from({ length: 10 }, (_, slot) => ({
      slot,
      studentUid: `student-${slot}`,
    }));
    expect(parseWalkthroughTimelineDocument(tenStudentParty)).toEqual(tenStudentParty);

    const invalidSlot = validDocument();
    invalidSlot.parties[0].units = [{ slot: 6, studentUid: "student-1" }];
    expect(() => parseWalkthroughTimelineDocument(invalidSlot)).toThrow("올바르지 않아요");
  });
});
