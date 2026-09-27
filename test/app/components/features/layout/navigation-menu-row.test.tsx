import { describe, expect, it } from "@jest/globals";
import { FireIcon } from "@heroicons/react/24/outline";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { NavigationFavoriteMenuRow, NavigationMenuRow } from "~/components/features/layout/NavigationMenuRow";

function renderRow(overrides: Partial<React.ComponentProps<typeof NavigationMenuRow>> = {}): string {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <NavigationMenuRow
            to="/raids"
            name="총력전 / 대결전"
            OutlineIcon={FireIcon}
            SolidIcon={FireIcon}
            badgeLabel="진행중"
            showRedDot
            favoriteId="raids"
            onFavoriteToggle={() => undefined}
            {...overrides}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function renderFavoriteRow(overrides: Partial<React.ComponentProps<typeof NavigationMenuRow>> = {}): string {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <NavigationFavoriteMenuRow
            to="/raids"
            name="총력전 / 대결전"
            OutlineIcon={FireIcon}
            SolidIcon={FireIcon}
            isActive
            favoriteId="raids"
            onFavoriteToggle={() => undefined}
            {...overrides}
          />
        ),
      },
    ],
    { initialEntries: ["/raids"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("navigation menu row favorite affordance", () => {
  it("suppresses active styling and aria-current for favorite rows", () => {
    const html = renderFavoriteRow();

    expect(html).toContain('aria-label="총력전 / 대결전"');
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain("font-normal text-foreground/75");
    expect(html).not.toContain("bg-background font-semibold");
  });

  it("hides only the badge slot when the favorite star can appear and preserves the row name", () => {
    const html = renderRow();

    expect(html).toContain('aria-label="총력전 / 대결전, 진행중, 새 항목 있음"');
    expect(html).toContain("min-h-6.5 min-w-0 items-center rounded-md px-2 text-xs transition-colors");
    expect(html).toContain('class="min-w-0 flex-1 truncate">총력전 / 대결전</span>');
    expect(html).toContain("transition-opacity group-hover:opacity-0 group-has-[button:focus-visible]:opacity-0");

    const starButton = html.match(/<button[^>]*aria-label="총력전 \/ 대결전 즐겨찾기에 추가"[^>]*>/)?.[0];
    expect(starButton).toBeDefined();
    expect(starButton).not.toContain("bg-card");
  });

  it("keeps badge visibility when the row has no favorite star", () => {
    const html = renderRow({ favoriteId: undefined });

    expect(html).toContain('aria-label="총력전 / 대결전, 진행중, 새 항목 있음"');
    expect(html).not.toContain("group-hover:opacity-0");
    expect(html).not.toContain("group-has-[button:focus-visible]");
  });

  it("keeps badges visible on disabled rows", () => {
    const html = renderRow({ disabled: true });

    expect(html).toContain("진행중");
    expect(html).toContain("bg-destructive");
    expect(html).not.toContain("group-hover:opacity-0");
    expect(html).not.toContain("aria-label=\"총력전 / 대결전 즐겨찾기에 추가\"");
  });
});
