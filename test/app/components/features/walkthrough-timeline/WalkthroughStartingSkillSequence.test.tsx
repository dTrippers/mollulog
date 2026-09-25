import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import WalkthroughStartingSkillSequence from "~/components/features/walkthrough-timeline/WalkthroughStartingSkillSequence";

describe("WalkthroughStartingSkillSequence", () => {
  it("renders a wrapping image chain with accessible order and an explicit missing-student state", () => {
    const studentUids = Array.from({ length: 9 }, (_, index) => `student-${index}`);
    const studentsByUid = Object.fromEntries(
      studentUids.slice(0, 8).map((uid, index) => [uid, { name: `학생 ${index + 1}` }]),
    );
    const markup = renderToStaticMarkup(
      <WalkthroughStartingSkillSequence
        partyUid="party-1"
        studentUids={studentUids}
        studentsByUid={studentsByUid}
        label="시작 스킬 순서"
        emptyMessage="지정된 시작 스킬이 없어요."
      />,
    );

    expect(markup).toContain("flex max-w-full flex-wrap");
    expect(markup.match(/<li\b/g) ?? []).toHaveLength(9);
    expect(markup.match(/aria-hidden="true">→<\/span>/g) ?? []).toHaveLength(8);
    expect(markup).toContain('class="sr-only">1번</span>');
    expect(markup).toContain('alt="학생 1"');
    expect(markup).toContain('aria-label="학생 정보 없음"');
    expect(markup).toContain(">학생 정보 없음</span>");
    expect(markup).not.toContain(">학생 1</span>");
  });
});
