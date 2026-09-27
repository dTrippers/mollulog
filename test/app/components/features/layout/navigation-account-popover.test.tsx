import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { NavigationAccountPopover } from "~/components/features/layout/NavigationAccountPopover";
import { getAccountNavigationActions } from "~/components/features/layout/navigation-menu";

function renderAccountPopover(isActive = false): string {
  const actions = getAccountNavigationActions({
    pathname: "/@lyn/students",
    upcomingEvent: null,
    hasOngoingRaid: false,
    hasUnconsumedCoupons: false,
    isSignedIn: true,
    currentUsername: "lyn",
  });
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <NavigationAccountPopover
            variant="rail"
            username="lyn"
            profileStudentId={null}
            darkMode={false}
            isActive={isActive}
            actions={actions}
            isOpen
            onOpenChange={() => undefined}
            onDarkModeChange={() => undefined}
            onShowSignIn={() => undefined}
          />
        ),
      },
    ],
    { initialEntries: ["/@lyn/students"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("navigation account popover", () => {
  it("keeps the first render hidden until its trigger position is measured", () => {
    const html = renderAccountPopover();
    const dialog = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? "";

    expect(dialog).toContain("aria-hidden=\"true\"");
    expect(dialog).toContain("pointer-events-none invisible opacity-0");
    expect(dialog).not.toContain("top:12px");
    expect(dialog).not.toContain("left:12px");
  });

  it("uses the reference row weight and keeps logout icon-free", () => {
    const html = renderAccountPopover();
    const logout = html.match(/<a[^>]*href="\/signout"[^>]*>(.*?)<\/a>/)?.[1] ?? "";

    expect(html).toContain("text-sm font-normal");
    expect(logout).toContain("로그아웃");
    expect(logout).not.toContain("<svg");
  });

  it("shows the account trigger as active on the current personal route", () => {
    const html = renderAccountPopover(true);
    const trigger = html.match(/<button(?=[^>]*aria-label="계정 lyn")[^>]*>/)?.[0] ?? "";

    expect(trigger).toContain("bg-muted text-foreground");
  });
});
