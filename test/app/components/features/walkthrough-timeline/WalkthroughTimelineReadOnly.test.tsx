import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { WalkthroughTimelineReadOnly } from "~/components/features/walkthrough-timeline/WalkthroughTimelineReadOnly";
import type { WalkthroughParty } from "~/domain/walkthrough-timeline";

const party: WalkthroughParty = {
  uid: "party-1",
  order: 0,
  startingSkillStudentUids: ["unknown-student"],
  units: [
    {
      slot: 0,
      studentUid: "unknown-student",
      snapshot: { tier: 5, level: 90, skillEx: 5 },
    },
  ],
  steps: [],
};

describe("WalkthroughTimelineReadOnly", () => {
  it("shows the formation, ordered skill, growth, and steps in order with explicit missing data", () => {
    const markup = renderToStaticMarkup(
      <WalkthroughTimelineReadOnly parties={[party]} partySize={10} studentsByUid={{}} />,
    );

    expect(markup.indexOf(">파티 1</h2>")).toBeLessThan(markup.indexOf('aria-label="파티 1 편성"'));
    expect(markup.indexOf('aria-label="파티 1 편성"')).toBeLessThan(markup.indexOf(">성장도 자세히 보기<"));
    expect(markup.indexOf(">성장도 자세히 보기<")).toBeLessThan(markup.indexOf(">시작 스킬 순서</h3>"));
    expect(markup.indexOf(">시작 스킬 순서</h3>")).toBeLessThan(markup.indexOf(">타임라인</h3>"));
    expect(markup).toContain('aria-label="스트라이커 편성"');
    expect(markup).toContain('aria-label="스페셜 편성"');
    expect(markup).toContain("@min-[544px]:grid-cols-[repeat(6,minmax(0,1fr))_0.25rem_repeat(4,minmax(0,1fr))]");
    expect(markup).toContain("@min-[544px]:col-start-8");
    expect(markup).not.toContain("스트라이커 6명");
    expect(markup).not.toContain("스페셜 4명");
    expect(markup).not.toContain("<h4");
    expect(markup).toContain("학생 정보 없음");
    expect(markup).toContain("성장도 자세히 보기");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('id="party-1-growth-toggle"');
    expect(markup.match(/aria-controls="party-1-growth-details"/g)).toHaveLength(1);
    expect(markup).toContain(
      '<section id="party-1-growth-details" aria-label="파티 1 상세 성장도" hidden="">',
    );
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain('aria-label="시작 스킬 1번"');
  });

  it("shows the saved tier in the card footer and an explicit missing tier when absent", () => {
    const knownStudentParty: WalkthroughParty = {
      ...party,
      startingSkillStudentUids: [],
      units: [{ slot: 0, studentUid: "known-student", snapshot: {} }],
    };
    const markup = renderToStaticMarkup(
      <WalkthroughTimelineReadOnly
        parties={[knownStudentParty]}
        partySize={6}
        studentsByUid={{ "known-student": { name: "학생 이름" } }}
      />,
    );

    expect(markup).toContain("학생 이름");
    expect(markup).toContain("미입력");
    expect(markup).toContain(
      '<section id="party-1-growth-details" aria-label="파티 1 상세 성장도" hidden="">',
    );
  });
});
