/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import EventComment from "~/routes/events.$uid._components/EventComment";

jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));
jest.mock("~/components/features/contents/ContentCommentEditor", () => ({
  __esModule: true,
  default: ({ hideRecruitmentOpinions }: { hideRecruitmentOpinions: boolean }) => (
    <p data-testid="editor">{hideRecruitmentOpinions ? "hidden" : "shown"}</p>
  ),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

describe("EventComment recruitment opinion filter", () => {
  it("keeps results hidden for a guest after mount", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <EventComment
              allComments={[]}
              me={null}
              eventUid="event-1"
              hideRecruitmentOpinions
              canFilterRecruitmentOpinions
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("editor").textContent).toBe("hidden");
    expect(screen.getByRole("button", { name: "모집 결과 숨기기 설정" }).getAttribute("aria-pressed")).toBe("true");
  });
});
