/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FriendList, getBioFirstLine } from "../../../app/routes/$username.friends._components/FriendList";

describe("getBioFirstLine", () => {
  it("returns the first non-empty line", () => {
    expect(getBioFirstLine("\n  첫 줄  \n둘째 줄")).toBe("첫 줄");
    expect(getBioFirstLine("   ")).toBeNull();
    expect(getBioFirstLine(null)).toBeNull();
  });
});

describe("FriendList", () => {
  it("shows the empty copy of each tab", () => {
    const { rerender } = render(
      <MemoryRouter>
        <FriendList tab="following" senseis={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("아직 팔로우한 선생님이 없어요")).toBeTruthy();
    rerender(
      <MemoryRouter>
        <FriendList tab="followers" senseis={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("아직 팔로워가 없어요")).toBeTruthy();
  });

  it("links each row to the profile with the id, the first bio line and the friend code", () => {
    render(
      <MemoryRouter>
        <FriendList
          tab="following"
          senseis={[
            { username: "arona", bio: "첫 줄\n둘째 줄", profileStudentId: null, friendCode: "ABCDEFGH" },
            { username: "plana", bio: null, profileStudentId: null, friendCode: null },
          ]}
        />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/@arona", "/@plana"]);
    expect(screen.getByText("첫 줄")).toBeTruthy();
    expect(screen.queryByText("둘째 줄")).toBeNull();
    expect(screen.getByText("친구 코드 ABCDEFGH")).toBeTruthy();
  });
});
