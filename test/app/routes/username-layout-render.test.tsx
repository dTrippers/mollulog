/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRoutesStub, data } from "react-router";
import { SignInProvider, useSignIn } from "~/contexts/SignInProvider";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

if (typeof globalThis.Response === "undefined") {
  class TestResponse {
    readonly status: number;
    readonly headers: Headers;

    constructor(_body: unknown = null, init: ResponseInit = {}) {
      this.status = init.status ?? 200;
      this.headers = new Headers(init.headers);
    }
  }
  Object.defineProperty(globalThis, "Response", { value: TestResponse as unknown as typeof Response });
}

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/followership", () => ({ getFollowershipSummary: jest.fn() }));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn() }));
jest.mock("~/models/recruitment-result.server", () => ({ getRecruitmentResults: jest.fn() }));
jest.mock("~/routes/$username._components/route-sensei.server", () => ({ getRouteSensei: jest.fn() }));

import UserLayout, { ErrorBoundary } from "~/routes/$username";
import {
  MOVED_MENUS_NOTICE_ENDS_AT,
  MOVED_MENUS_NOTICE_STORAGE_KEY,
  MovedMenusNotice,
  useMovedMenusNotice,
} from "~/routes/$username._components/MovedMenusNotice";
import { useUserLayout } from "~/routes/$username._components/user-layout";

type LayoutData = {
  username: string;
  labels: string[];
  profileStudentId: string | null;
  profileVisibility: "public" | "private";
  growthVisibility: boolean;
  isOwner: boolean;
  signedIn: boolean;
  following: boolean;
  bio: string | null;
  friendCode: string | null;
  followCounts: { following: number; followers: number } | null;
  recruitedStudentCount: number | null;
  pickupCount: number | null;
};

const base: LayoutData = {
  username: "sensei",
  labels: [],
  profileStudentId: null,
  profileVisibility: "public",
  growthVisibility: false,
  isOwner: false,
  signedIn: false,
  following: false,
  bio: "첫 줄\n둘째 줄",
  friendCode: "ABCDEFGH",
  followCounts: { following: 3, followers: 1234 },
  recruitedStudentCount: 244,
  pickupCount: 56,
};

function ChildScreen() {
  const layout = useUserLayout();
  return <p data-testid="child">{`${layout.username}:${layout.isOwner}`}</p>;
}

function renderLayout(
  overrides: Partial<LayoutData> = {},
  { path = "/@sensei", followAction }: { path?: string; followAction?: (args: { request: Request }) => unknown } = {},
) {
  const Stub = createRoutesStub([
    {
      path: "/api/followerships",
      action: followAction ?? (() => ({ followed: true })),
    },
    {
      id: "user",
      path: "/:username",
      loader: () => ({ ...base, ...overrides }),
      HydrateFallback: () => null,
      Component: UserLayout,
      children: [
        { index: true, Component: ChildScreen },
        { path: "students", Component: ChildScreen },
        { path: "pickups", Component: ChildScreen },
      ],
    },
  ]);
  return render(
    <SignInProvider>
      <Stub initialEntries={[path]} />
    </SignInProvider>,
  );
}

function renderBoundary(error: { status: number; code?: string; message?: string; details?: unknown }) {
  const Stub = createRoutesStub([
    {
      path: "/:username",
      loader: () => {
        throw data({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
      },
      HydrateFallback: () => null,
      Component: UserLayout,
      ErrorBoundary,
    },
  ]);
  return render(<Stub initialEntries={["/@sensei"]} />);
}

beforeEach(() => {
  installLayoutTestEnv();
});

describe("@username layout header", () => {
  it("shows the owner the @username title and the primary 프로필 관리 button, without a visibility line", async () => {
    renderLayout({ isOwner: true, signedIn: true });

    expect(await screen.findByRole("heading", { level: 1, name: "@sensei" })).toBeTruthy();
    expect(screen.queryByText(/프로필 공개|학생 성장도/)).toBeNull();
    const manage = screen.getByRole("link", { name: "프로필 관리" });
    expect(manage.getAttribute("href")).toBe("/edit");
    expect(screen.queryByRole("button", { name: "팔로우" })).toBeNull();
    expect(screen.queryByText("선생님의 정보를 확인해보세요")).toBeNull();
  });

  it("marks a private profile beside the @username", async () => {
    renderLayout({ isOwner: true, signedIn: true, profileVisibility: "private" });

    expect(await screen.findByRole("heading", { level: 1, name: "@sensei 비공개 프로필" })).toBeTruthy();
  });

  it("shows the friend code and the follow counts linked to the friends tabs under the @username", async () => {
    renderLayout({ signedIn: true });

    const heading = await screen.findByRole("heading", { level: 1, name: "@sensei" });
    expect(heading.textContent).toBe("@sensei");
    expect(screen.getByText("ABCDEFGH")).toBeTruthy();
    expect(screen.getByRole("button", { name: "친구 코드 복사" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "팔로잉 3" }).getAttribute("href")).toBe("/@sensei/friends?tab=following");
    expect(screen.getByRole("link", { name: "팔로워 1,234" }).getAttribute("href")).toBe(
      "/@sensei/friends?tab=followers",
    );
  });

  it("shows the introduction in the header with its line breaks", async () => {
    renderLayout({ signedIn: true });

    await screen.findByRole("heading", { level: 1, name: "@sensei" });
    const bio = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "첫 줄\n둘째 줄");
    expect(bio.className).toContain("whitespace-pre-wrap");
  });

  it("leaves out a missing introduction and friend code and follow counts that failed to load", async () => {
    renderLayout({ signedIn: true, bio: null, friendCode: null, followCounts: null });

    await screen.findByRole("heading", { level: 1, name: "@sensei" });
    expect(screen.queryByText(/첫 줄/)).toBeNull();
    expect(screen.queryByText("친구 코드")).toBeNull();
    expect(screen.queryByRole("link", { name: /^팔로/ })).toBeNull();
  });

  it("shows a visitor only the title and the follow button", async () => {
    renderLayout({ signedIn: true });

    expect(await screen.findByRole("heading", { level: 1, name: "@sensei" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "팔로우" })).toBeTruthy();
    expect(screen.queryByText(/프로필 공개|프로필 비공개/)).toBeNull();
    expect(screen.queryByRole("link", { name: "프로필 관리" })).toBeNull();
  });

  it("hands the child routes the owner flag and username through the outlet context", async () => {
    renderLayout({ isOwner: true, signedIn: true });

    expect((await screen.findByTestId("child")).textContent).toBe("sensei:true");
  });
});

describe("@username layout menu", () => {
  it("lists 프로필, 모집한 학생, 모집 기록, 관심 학생 in the Aside for a visitor, without the moved entries", async () => {
    renderLayout();
    const aside = await screen.findByRole("complementary", { name: "보조 도구" });

    const nav = within(aside).getByRole("navigation", { name: "화면 탐색" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["프로필", "모집한 학생244", "모집 기록56", "관심 학생"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/@sensei",
      "/@sensei/students",
      "/@sensei/pickups",
      "/@sensei/futures",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    for (const removed of ["공략 작성하기", "공략 타임라인", "편성/공략"]) {
      expect(screen.queryByText(removed)).toBeNull();
    }
    expect(within(aside).queryByText("화면 인식·데이터 연동")).toBeNull();
  });

  it("marks the current screen from the path", async () => {
    renderLayout({}, { path: "/@sensei/pickups" });
    const aside = await screen.findByRole("complementary", { name: "보조 도구" });
    const current = within(aside)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current.map((link) => link.textContent)).toEqual(["모집 기록56"]);
  });

  it("omits a count that could not be loaded", async () => {
    renderLayout({ recruitedStudentCount: null, pickupCount: 0 });
    const aside = await screen.findByRole("complementary", { name: "보조 도구" });

    expect(within(aside).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "프로필",
      "모집한 학생",
      "모집 기록0",
      "관심 학생",
    ]);
  });

  it("gives only the owner the data connect shortcut in the Aside and the mobile action bar", async () => {
    const { unmount } = renderLayout({ isOwner: true, signedIn: true });
    const aside = await screen.findByRole("complementary", { name: "보조 도구" });

    const asideLink = within(aside).getByRole("link", { name: /화면 인식·데이터 연동/ });
    expect(asideLink.getAttribute("href")).toBe("/scanner");
    expect(within(asideLink).getByText("게임 스크린샷, 녹화 영상이나 외부 사이트 데이터를 반영할 수 있어요")).toBeTruthy();
    const actionBar = document.querySelector(".v2-action-bar") as HTMLElement;
    expect(within(actionBar).getByRole("link", { name: "데이터 연동" }).getAttribute("href")).toBe("/scanner");
    unmount();

    renderLayout({ signedIn: true });
    await screen.findByRole("heading", { level: 1, name: "@sensei" });
    expect(screen.queryByText("화면 인식·데이터 연동")).toBeNull();
    expect(document.querySelector(".v2-action-bar")).toBeNull();
  });
});

describe("@username moved menus notice", () => {
  const duringNotice = () => MOVED_MENUS_NOTICE_ENDS_AT - 1;

  beforeEach(() => {
    localStorage.removeItem(MOVED_MENUS_NOTICE_STORAGE_KEY);
    jest.spyOn(Date, "now").mockReturnValue(duringNotice());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tells only the owner where the moved menus are, under the Aside menu and above the screen while the Aside is hidden", async () => {
    renderLayout({ isOwner: true, signedIn: true });

    const aside = await screen.findByRole("complementary", { name: "보조 도구" });
    expect(await within(aside).findByText("공략 타임라인과 편성은 커뮤니티에서 확인해주세요.")).toBeTruthy();
    expect(within(aside).getByRole("link", { name: "내 공략 타임라인" }).getAttribute("href")).toBe("/timelines?mine=1");
    const notices = screen.getAllByText("공략 타임라인과 편성은 커뮤니티에서 확인해주세요.");
    expect(notices).toHaveLength(2);
    const stacked = notices.find((notice) => !aside.contains(notice));
    expect(stacked?.closest(".v2-stacked-only")).toBeTruthy();
  });

  it("closes both copies of the notice at once", async () => {
    renderLayout({ isOwner: true, signedIn: true });

    const [close] = await screen.findAllByRole("button", { name: "안내 닫기" });
    fireEvent.click(close as HTMLElement);
    expect(screen.queryAllByText("공략 타임라인과 편성은 커뮤니티에서 확인해주세요.")).toHaveLength(0);
  });

  it("does not show the notice to a visitor", async () => {
    renderLayout({ signedIn: true });

    await screen.findByRole("heading", { level: 1, name: "@sensei" });
    expect(screen.queryByText("공략 타임라인과 편성은 커뮤니티에서 확인해주세요.")).toBeNull();
  });

  it("remembers a dismissal in this browser", async () => {
    const first = render(<MemoryRouterNotice now={duringNotice} />);
    fireEvent.click(await screen.findByRole("button", { name: "안내 닫기" }));
    expect(screen.queryByText("공략 타임라인과 편성은 커뮤니티에서 확인해주세요.")).toBeNull();
    expect(localStorage.getItem(MOVED_MENUS_NOTICE_STORAGE_KEY)).toBe("1");
    first.unmount();

    render(<MemoryRouterNotice now={duringNotice} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "안내 닫기" })).toBeNull());
  });

  it("stops showing once the notice period ends", async () => {
    render(<MemoryRouterNotice now={() => MOVED_MENUS_NOTICE_ENDS_AT} />);

    await waitFor(() => expect(screen.queryByRole("button", { name: "안내 닫기" })).toBeNull());
    expect(screen.queryByText("공략 타임라인과 편성은 커뮤니티에서 확인해주세요.")).toBeNull();
  });
});

function NoticeWithState({ now }: { now: () => number }) {
  const notice = useMovedMenusNotice(now);
  return notice.visible ? <MovedMenusNotice onDismiss={notice.dismiss} /> : null;
}

function MemoryRouterNotice({ now }: { now: () => number }) {
  const Stub = createRoutesStub([{ path: "/", Component: () => <NoticeWithState now={now} /> }]);
  return <Stub initialEntries={["/"]} />;
}

describe("@username follow button", () => {
  it("follows with the existing action contract and reports a failure in words", async () => {
    const methods: string[] = [];
    renderLayout(
      { signedIn: true },
      {
        followAction: ({ request }: { request: Request }) => {
          methods.push(request.method);
          return data({ error: { message: "error" } }, { status: 500 });
        },
      },
    );
    const button = await screen.findByRole("button", { name: "팔로우" });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("팔로우하지 못했어요. 다시 시도해주세요.");
    expect(screen.queryByText("error")).toBeNull();
    expect(methods).toEqual(["POST"]);
  });

  it("shows 팔로우 중 for someone already followed", async () => {
    renderLayout({ signedIn: true, following: true });

    expect(await screen.findByRole("button", { name: "팔로우 중, 누르면 팔로우 해제" })).toBeTruthy();
  });

  it("asks a signed-out visitor to sign in before following, without sending a request", async () => {
    const followAction = jest.fn(() => ({ followed: true }));
    function SignInProbe() {
      const { isSignInVisible } = useSignIn();
      return <p data-testid="sign-in">{String(isSignInVisible)}</p>;
    }
    const Stub = createRoutesStub([
      { path: "/api/followerships", action: followAction },
      { id: "user", path: "/:username", loader: () => base, HydrateFallback: () => null, Component: UserLayout },
    ]);
    render(
      <SignInProvider>
        <SignInProbe />
        <Stub initialEntries={["/@sensei"]} />
      </SignInProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "팔로우" }));
    const dialog = await screen.findByRole("dialog", { name: "로그인이 필요해요" });
    expect(within(dialog).getByText("로그인하면 이 선생님을 팔로우할 수 있어요.")).toBeTruthy();
    expect(followAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("sign-in").textContent).toBe("false");

    fireEvent.click(within(dialog).getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByTestId("sign-in").textContent).toBe("true"));
    expect(followAction).not.toHaveBeenCalled();
  });
});

describe("@username layout error states", () => {
  it("shows a visitor of a private profile only the @username and the private state", async () => {
    renderBoundary({
      status: 403,
      code: "sensei.profile_private",
      message: "이 프로필은 비공개예요",
      details: { username: "sensei_aris" },
    });

    expect(await screen.findByText("비공개 프로필이에요")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "@sensei_aris" })).toBeTruthy();
    expect(screen.getByText("이 프로필의 정보와 작성한 콘텐츠는 본인만 볼 수 있어요.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "화면 탐색" })).toBeNull();
  });

  it("says an unknown username cannot be found and asks to check the address", async () => {
    renderBoundary({ status: 404, code: "sensei.not_found", message: "선생님을 찾을 수 없어요", details: { username: "x" } });

    expect(await screen.findByText("선생님을 찾을 수 없어요")).toBeTruthy();
    expect(screen.getByText("주소의 @아이디를 다시 확인해주세요.")).toBeTruthy();
  });

  it("shows a retryable failure state for a server error instead of the raw message", async () => {
    renderBoundary({ status: 500, message: "database unavailable" });

    expect(await screen.findByText("프로필을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
    expect(screen.queryByText("database unavailable")).toBeNull();
  });
});
