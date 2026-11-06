/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, jest } from "@jest/globals";
import { createMemoryRouter, RouterProvider } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

const mockSubmit = jest.fn();
const mockActionData = jest.fn<() => unknown>(() => null);

jest.mock("react-router", () => ({
  ...jest.requireActual<typeof import("react-router")>("react-router"),
  useSubmit: () => mockSubmit,
  useActionData: () => mockActionData(),
}));
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => ({ error: jest.fn() })) }));
jest.mock("~/models/student", () => ({ formatStudentFullName: jest.fn(), getStudentGradeDetail: jest.fn() }));
jest.mock("~/models/student-grading.server", () => ({
  deleteStudentGrading: jest.fn(),
  getStudentGrading: jest.fn(),
  upsertStudentGrading: jest.fn(),
}));

import StudentGrade from "~/routes/students.$id.grade";

describe("student grading form", () => {
  it("shows the character counter and requires confirmation before deleting an evaluation", async () => {
    installLayoutTestEnv();
    mockSubmit.mockClear();
    const router = createMemoryRouter(
      [
        {
          path: "/students/:id/grade",
          Component: StudentGrade,
          loader: () => ({
            student: { uid: "student-a", name: "학생" },
            existingGrading: { comment: "기존 의견", tags: ["performance"] },
          }),
          HydrateFallback: () => null,
        },
      ],
      { initialEntries: ["/students/student-a/grade"] },
    );
    render(<RouterProvider router={router} />);

    const comment = await screen.findByRole("textbox", { name: "평가 의견 (선택)" });
    fireEvent.change(comment, { target: { value: "새로운 평가 의견" } });
    expect(screen.getByText("9/100")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    let dialog = screen.getByRole("dialog", { name: "정말 이 평가를 삭제할까요?" });
    expect(within(dialog).getByText("정말 이 평가를 삭제할까요?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "정말 이 평가를 삭제할까요?" })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    dialog = screen.getByRole("dialog", { name: "정말 이 평가를 삭제할까요?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(mockSubmit).toHaveBeenCalledWith({ intent: "delete" }, { method: "post" });
  });

  it("shows a failed delete error inside the confirmation dialog", async () => {
    installLayoutTestEnv();
    mockSubmit.mockClear();
    mockActionData.mockReturnValue({ error: "평가를 삭제하지 못했어요" });
    const router = createMemoryRouter(
      [
        {
          path: "/students/:id/grade",
          Component: StudentGrade,
          loader: () => ({
            student: { uid: "student-a", name: "학생" },
            existingGrading: { comment: "기존 의견", tags: ["performance"] },
          }),
          HydrateFallback: () => null,
        },
      ],
      { initialEntries: ["/students/student-a/grade"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    const dialog = screen.getByRole("dialog", { name: "정말 이 평가를 삭제할까요?" });
    expect(within(dialog).getByText("평가를 삭제하지 못했어요")).toBeTruthy();
    expect(within(dialog).getByRole("alert")).toBeTruthy();
    mockActionData.mockReturnValue(null);
  });
});
