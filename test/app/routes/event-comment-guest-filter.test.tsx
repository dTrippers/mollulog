/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { EventOpinions } from "~/routes/events.$uid._components/EventOpinions";

jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));
jest.mock("~/components/v2/features/comments/OpinionPreview", () => ({
  OpinionPreview: ({ hidden }: { hidden: boolean }) => <p data-testid="preview">{hidden ? "hidden" : "shown"}</p>,
}));
jest.mock("~/components/v2/features/comments/OpinionSheet", () => ({
  OpinionSheet: ({ hideRecruitmentOpinions }: { hideRecruitmentOpinions: boolean }) => (
    <p data-testid="sheet">{hideRecruitmentOpinions ? "hidden" : "shown"}</p>
  ),
}));

describe("EventOpinions recruitment opinion filter", () => {
  it("keeps results hidden for a guest after mount", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <EventOpinions
              eventUid="event-1"
              eventName="Event"
              isLive={false}
              initialComments={[]}
              initialUnavailable={false}
              signedIn={false}
              initialHideRecruitmentOpinions
              canFilterRecruitmentOpinions
              now="2030-01-01T00:00:00.000Z"
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId("preview").textContent).toBe("hidden");
    expect(screen.getByTestId("sheet").textContent).toBe("hidden");
  });
});
