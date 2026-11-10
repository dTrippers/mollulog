/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ProfileIntroCard } from "../../../app/routes/$username._index._components/ProfileIntroCard";
import { ProfileRecordSummary } from "../../../app/routes/$username._index._components/ProfileRecordSummary";

function renderInRouter(element: React.ReactElement) {
  const router = createMemoryRouter([{ path: "*", element }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

describe("ProfileIntroCard", () => {
  it("links the follower count to the followers tab", async () => {
    renderInRouter(
      <ProfileIntroCard username="arona" bio="소개" friendCode="ABCDEFGH" followingCount={3} followerCount={12} />,
    );
    expect((await screen.findByRole("link", { name: "팔로워 12" })).getAttribute("href")).toBe(
      "/@arona/friends?tab=followers",
    );
    expect(screen.getByRole("link", { name: "팔로잉 3" }).getAttribute("href")).toBe("/@arona/friends?tab=following");
  });

  it("omits the bio and the friend code when they are empty", async () => {
    renderInRouter(<ProfileIntroCard username="arona" bio={null} friendCode={null} followingCount={0} followerCount={0} />);
    await screen.findByRole("link", { name: "팔로워 0" });
    expect(screen.queryByText("친구 코드")).toBeNull();
  });
});

describe("ProfileRecordSummary", () => {
  const props = { username: "arona", tierCounts: { 3: 2 }, recruitedCount: 2, totalCount: 10 };

  it("shows the empty copy without records", async () => {
    renderInRouter(
      <ProfileRecordSummary
        {...props}
        records={{
          status: "ready",
          summary: { recordCount: 0, totalTrial: 0, tier3Count: 0, tier3RateCount: 0, pickupCount: 0, pickupRateCount: 0 },
        }}
      />,
    );
    expect(await screen.findByText("아직 모집 기록이 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "모집한 학생 2명 보기" }).getAttribute("href")).toBe("/@arona/students");
  });

  it("shows rates only when a trial count exists", async () => {
    renderInRouter(
      <ProfileRecordSummary
        {...props}
        records={{
          status: "ready",
          summary: { recordCount: 2, totalTrial: 100, tier3Count: 3, tier3RateCount: 3, pickupCount: 1, pickupRateCount: 1 },
        }}
      />,
    );
    expect(await screen.findByText("3.00%")).toBeTruthy();
    expect(screen.getByText("1.00%")).toBeTruthy();
  });

  it("shows 미입력 and no rate when no record has a trial count", async () => {
    renderInRouter(
      <ProfileRecordSummary
        {...props}
        records={{
          status: "ready",
          summary: { recordCount: 1, totalTrial: 0, tier3Count: 2, tier3RateCount: 0, pickupCount: 0, pickupRateCount: 0 },
        }}
      />,
    );
    expect(await screen.findByText("미입력")).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("shows a failure state with a retry instead of numbers", async () => {
    renderInRouter(<ProfileRecordSummary {...props} records={{ status: "failed" }} />);
    expect(await screen.findByText("모집 기록을 불러오지 못했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});
