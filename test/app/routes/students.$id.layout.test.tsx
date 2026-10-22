/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { createMemoryRouter, RouterProvider } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";
import StudentDetailPage, { loader } from "~/routes/students.$id";

const student = {
  uid: "student-a",
  name: "학생",
  familyName: null,
  school: "millennium",
  attackType: "explosive",
  defenseType: "light",
  role: "striker",
  position: "front",
  tacticRole: "attacker",
  catalog: null,
  schaleDbId: null,
  club: null,
  character: { studentVariants: [] },
  studentVariant: { uid: "variant-a", isMulticlass: false, student: null, students: [], primaryStudent: { uid: "student-a", name: "학생" } },
  interactionFurnitures: [],
  releaseAt: "2026-01-01T00:00:00.000Z",
} as unknown as Awaited<ReturnType<typeof loader>>["student"];

function renderStudentDetail(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/students/:id",
        Component: StudentDetailPage,
        loader: () => ({ student }),
        children: [
          { index: true, Component: () => <p>학생 정보</p> },
          { path: "statistics", Component: () => <p>편성/통계</p> },
          { path: "gradings", Component: () => <p>평가 목록</p> },
          { path: "grade", Component: () => <p>평가 작성</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe("student detail layout", () => {
  beforeEach(() => installLayoutTestEnv());

  it.each(["/students/student-a/gradings", "/students/student-a/grade"])(
    "keeps the evaluation tab current on %s",
    async (path) => {
      renderStudentDetail(path);

      expect((await screen.findByRole("link", { name: "평가" })).getAttribute("aria-current")).toBe("page");
      expect(screen.getByRole("navigation", { name: "화면 탐색" })).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1, name: "학생" })).toBeTruthy();
    },
  );
});
