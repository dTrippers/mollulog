/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "@jest/globals";
import { createMemoryRouter, RouterProvider } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";
import { routeError } from "~/lib/http-errors";
import { StudentDetailErrorBoundary } from "~/routes/students.$id._components/StudentDetailErrorBoundary";

function renderError(status: number) {
  const router = createMemoryRouter(
    [
      {
        path: "/students/student-a",
        loader: () => {
          throw routeError(status, status === 404 ? "student.not_found" : "student.load_failed", "internal detail");
        },
        Component: () => null,
        ErrorBoundary: StudentDetailErrorBoundary,
      },
    ],
    { initialEntries: ["/students/student-a"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("student detail error states", () => {
  it("renders the not-found message with a back link for 404", async () => {
    installLayoutTestEnv();
    renderError(404);

    expect(await screen.findByText("해당하는 학생 정보가 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "학생 목록" }).getAttribute("href")).toBe("/students");
  });

  it("renders the retryable load failure without exposing internal details for 500", async () => {
    installLayoutTestEnv();
    renderError(500);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("학생 정보를 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.queryByText("internal detail")).toBeNull();
  });
});
