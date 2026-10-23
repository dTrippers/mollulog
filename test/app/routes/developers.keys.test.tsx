/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { V2Page } from "~/components/v2/layout/V2Page";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/mollulog-api", () => ({
  createPersonalApiKey: jest.fn(),
  getPersonalApiKeys: jest.fn(),
  revokePersonalApiKey: jest.fn(),
}));

import DevelopersKeys from "~/routes/developers.keys";

type KeysLoaderData = { keys: unknown[]; loadError: boolean; loadedAt: number };

function DevelopersShell() {
  return (
    <V2Page width="wide">
      <Outlet />
    </V2Page>
  );
}

function renderKeysPage(loaderData: KeysLoaderData, loader: () => KeysLoaderData | Promise<KeysLoaderData> = () => loaderData) {
  const RoutesStub = createRoutesStub([
    {
      id: "developers",
      path: "/developers",
      Component: DevelopersShell,
      children: [
        {
          id: "developers-keys",
          path: "keys",
          loader,
          Component: DevelopersKeys,
        },
      ],
    },
  ]);
  return render(
    <RoutesStub
      initialEntries={["/developers/keys"]}
      hydrationData={{ loaderData: { "developers-keys": loaderData } }}
    />,
  );
}

const loadedAt = Date.parse("2026-10-18T00:00:00Z");

describe("developers API key screen", () => {
  it("keeps inactive keys folded and confirms revocation inline", () => {
    renderKeysPage({
      loadError: false,
      loadedAt,
      keys: [
        {
          uid: "active-uid",
          name: "Personal integration",
          scopes: ["students:read"],
          createdAt: "2026-09-02T00:00:00.000Z",
          expiresAt: "2027-09-02T00:00:00.000Z",
          lastUsedAt: "2026-10-17T12:04:00.000Z",
          revokedAt: null,
        },
        {
          uid: "inactive-uid",
          name: "Expired integration",
          scopes: ["students:read"],
          createdAt: "2025-09-02T00:00:00.000Z",
          expiresAt: "2026-09-02T00:00:00.000Z",
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    });

    expect(screen.getByRole("heading", { name: "Personal integration" })).toBeTruthy();
    const inactiveSummary = screen.getByText("만료·삭제된 키 1개");
    const inactiveSection = inactiveSummary.closest("details");
    expect(inactiveSection?.hasAttribute("open")).toBe(false);

    fireEvent.click(inactiveSummary);
    expect(inactiveSection?.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("heading", { name: "Expired integration" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Personal integration API 키 삭제" }));
    expect(screen.getByText("삭제하면 이 키로 연결한 도구에서 더 이상 API를 사용할 수 없어요.")).toBeTruthy();
    expect((screen.getByDisplayValue("active-uid") as HTMLInputElement).name).toBe("keyUid");
    expect((screen.getByDisplayValue("Personal integration") as HTMLInputElement).name).toBe("keyName");
  });

  it("shows profile permissions and includes read when write permission is selected", () => {
    renderKeysPage({ keys: [], loadError: false, loadedAt });

    fireEvent.click(screen.getByRole("button", { name: "새 API 키 발급" }));
    const read = screen.getByRole("checkbox", { name: "학생 읽기" }) as HTMLInputElement;
    const write = screen.getByRole("checkbox", { name: "학생 쓰기" }) as HTMLInputElement;
    const profile = screen.getByRole("checkbox", { name: "프로필 보기" }) as HTMLInputElement;
    expect(profile.checked).toBe(false);
    expect(read.checked).toBe(true);
    expect(write.checked).toBe(false);

    fireEvent.click(write);

    expect(read.checked).toBe(true);
    expect(read.disabled).toBe(true);
    expect(write.checked).toBe(true);
    const form = screen.getByRole("textbox", { name: "이름" }).closest("form") as HTMLFormElement;
    const formData = new FormData(form);
    expect(formData.getAll("readScope")).toEqual(["true"]);
    expect(formData.getAll("writeScope")).toEqual(["true"]);
    fireEvent.click(profile);
    expect(new FormData(form).getAll("profileScope")).toEqual(["true"]);
  });

  it("shows the empty state only after a successful empty load", () => {
    renderKeysPage({ keys: [], loadError: false, loadedAt });

    expect(screen.getByRole("heading", { name: "사용할 수 있는 API 키가 없어요" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "API 키 목록을 불러오지 못했어요" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다시 불러오기" })).toBeNull();
  });

  it("shows load failure distinctly and recovers when retry revalidates successfully", async () => {
    const retryLoader = jest.fn(async () => ({ keys: [], loadError: false, loadedAt }));
    renderKeysPage({ keys: [], loadError: true, loadedAt }, retryLoader);

    expect(screen.getByText("API 키 목록을 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "사용할 수 있는 API 키가 없어요" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByRole("heading", { name: "사용할 수 있는 API 키가 없어요" })).toBeTruthy();
    expect(retryLoader).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("API 키 목록을 불러오지 못했어요.")).toBeNull();
  });
});
