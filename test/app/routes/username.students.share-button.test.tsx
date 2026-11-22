/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import ShareStudentGrowthButton, {
  type ShareStudentGrowthBlock,
} from "~/routes/$username.students._components/ShareStudentGrowthButton";

jest.mock("~/lib/google-analytics-events.client", () => ({ trackGoogleAnalyticsEvent: jest.fn() }));

function renderButton(blockedBy: ShareStudentGrowthBlock | null, onResult = jest.fn()) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <ShareStudentGrowthButton url="https://mollulog.net/@sensei/students" blockedBy={blockedBy} onResult={onResult} />,
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return onResult;
}

describe("ShareStudentGrowthButton", () => {
  it("explains a private growth view instead of sharing a link that would open the summary", async () => {
    const onResult = renderButton("growth_private");
    fireEvent.click(await screen.findByRole("button", { name: "성장 상태 공유" }));

    expect(await screen.findByText("학생 성장도가 비공개라 성장 상태를 공유할 수 없어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "프로필 관리" }).getAttribute("href")).toBe("/edit");
    expect(onResult).not.toHaveBeenCalled();
  });

  it("explains a private profile instead of sharing", async () => {
    const onResult = renderButton("profile_private");
    fireEvent.click(await screen.findByRole("button", { name: "성장 상태 공유" }));

    expect(await screen.findByText("프로필이 비공개라 성장 상태를 공유할 수 없어요.")).toBeTruthy();
    expect(onResult).not.toHaveBeenCalled();
  });
});
