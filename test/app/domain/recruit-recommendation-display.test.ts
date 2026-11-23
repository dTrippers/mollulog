import { describe, expect, it } from "@jest/globals";
import {
  formatCommunityTag,
  formatCommunityTagLines,
  formatUsageSeason,
} from "~/domain/recruit-recommendation-display";

const names = new Map([["10002", "아루"]]);

describe("recruit recommendation display", () => {
  it("names this window's raid by its KR date and a past season by its JP month", () => {
    expect(
      formatUsageSeason(
        { source: "window", raidType: "elimination", startAt: "2026-11-30T19:00:00.000Z" },
        "Asia/Seoul",
      ),
    ).toBe("12/01 대결전");
    expect(
      formatUsageSeason(
        { source: "past", raidType: "total_assault", startAt: "2026-03-10T02:00:00.000Z" },
        "Asia/Seoul",
      ),
    ).toBe("2026.03 총력전");
  });

  it("writes a tag with its substitute and marks a tag from one source", () => {
    expect(
      formatCommunityTag({ kind: "substitute", value: "대체", substituteStudentUid: "10002", sourceCount: 2 }, names),
    ).toBe("대체: 아루");
    expect(formatCommunityTag({ kind: "content", value: "총력전", sourceCount: 1 }, names)).toBe(
      "총력전 (커뮤니티 평가 1건)",
    );
  });

  it("leaves out a substitute tag whose student is not known", () => {
    expect(
      formatCommunityTag({ kind: "substitute", value: "대체", substituteStudentUid: "99999", sourceCount: 2 }, names),
    ).toBeNull();
  });

  it("puts the agreed tags first and the single-source tags on a second line", () => {
    expect(
      formatCommunityTagLines(
        [
          { kind: "content", value: "총력전", sourceCount: 1 },
          { kind: "difficulty", value: "토먼트", sourceCount: 3 },
          { kind: "substitute", value: "대체", substituteStudentUid: "10002", sourceCount: 2 },
          { kind: "substitute", value: "대체", substituteStudentUid: "99999", sourceCount: 2 },
        ],
        names,
      ),
    ).toEqual(["토먼트 · 대체: 아루", "총력전 (커뮤니티 평가 1건)"]);
    expect(formatCommunityTagLines([], names)).toEqual([]);
  });
});
