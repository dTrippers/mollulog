/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { UserFollowButton } from "~/routes/$username._components/UserFollowButton";

function renderButton(following: boolean) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <UserFollowButton username="sensei" following={following} signedIn /> },
  ]);
  render(<Stub initialEntries={["/"]} />);
}

describe("UserFollowButton", () => {
  it("keeps both labels of a followed account in one cell, so hover swaps them without resizing the button", async () => {
    renderButton(true);
    const button = await screen.findByRole("button", { name: "팔로우 중, 누르면 팔로우 해제" });
    const resting = screen.getByText("팔로우 중");
    const hover = screen.getByText("팔로우 해제");

    expect(button.contains(resting) && button.contains(hover)).toBe(true);
    expect(resting.className).toContain("col-start-1 row-start-1");
    expect(hover.className).toContain("col-start-1 row-start-1");
    expect(resting.className).not.toContain("invisible");
    expect(hover.className).toContain("invisible");
  });
});
