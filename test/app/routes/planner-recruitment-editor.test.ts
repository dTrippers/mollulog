import { describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { studentImageUrl } from "~/models/assets";
import PlannerRecruitmentEditor from "~/routes/utils.planner._components/PlannerRecruitmentEditor";

function renderEditor() {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(PlannerRecruitmentEditor, {
        selectedDate: "2026-09-29",
        candidates: [
          {
            eventUid: "event-1",
            eventName: "이벤트",
            startDate: "2026-09-15",
            endDate: "2026-09-29",
            startAt: "2026-09-15T02:00:00.000Z",
            endAt: "2026-09-29T02:00:00.000Z",
            imageUrl: null,
            students: [
              { uid: "student-uid", imageUid: "student-image-uid", name: "학생 하나" },
              { uid: "student-2", imageUid: null, name: "학생 둘" },
            ],
          },
        ],
        timeZone: "Asia/Seoul",
        savedStates: [{ eventUid: "event-1", expectedTrials: null, favoriteStudentUids: ["student-uid"] }],
        isSaving: false,
        saveResult: null,
        onSave: () => {},
      }),
    ),
  );
}

describe("planner recruitment editor", () => {
  test("uses StudentCards image and selection ids separately and exposes selected state", () => {
    const markup = renderEditor();

    expect(markup).toContain(`src="${studentImageUrl("student-image-uid")}"`);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain("1/2명");
    expect(markup).toContain('href="/utils/pyroxene?eventUid=event-1"');
    expect(markup).toContain("청휘석 플래너에서 보기");
  });
});
