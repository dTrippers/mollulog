import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const css = readFileSync(join(process.cwd(), "app/tailwind.css"), "utf8");
const sheetSource = readFileSync(join(process.cwd(), "app/components/v2/primitives/Sheet.tsx"), "utf8");
const panelSource = readFileSync(join(process.cwd(), "app/components/v2/layout/PanelSheet.tsx"), "utf8");
const tabsSource = readFileSync(join(process.cwd(), "app/components/v2/layout/ScreenTabs.tsx"), "utf8");

// Body of the first rule whose selector line matches `selector` exactly (text before ` {`).
function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) {
    throw new Error(`rule not found: ${selector}`);
  }
  return source.slice(start, source.indexOf("}", start));
}

// The panel's own transition classes. The backdrop has its own enterFrom/leaveFrom, so pick the one that moves.
function panelTransitionValue(source: string, name: string): string {
  const matches = [...source.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((match) => match[1]);
  const panel = matches.find((value) => value.includes("translate-y-"));
  if (!panel) {
    throw new Error(`panel transition not found: ${name}`);
  }
  return panel;
}

describe("corr-2 layout CSS", () => {
  it("T1: side-by-side grid has the v2 column gap between Aside and Main", () => {
    expect(ruleBody(css, "  [data-v2-layout]:has(> .v2-aside)")).toContain("column-gap: var(--spacing-v2-column-gap);");
  });

  it("T2: toolbar margin is on the toolbar only, and stacked uses the block gap", () => {
    expect(ruleBody(css, "\n.v2-toolbar")).toContain("margin-bottom: var(--spacing-v2-group-gap);");
    expect(ruleBody(css, ".v2-toolbar-sentinel")).not.toContain("margin-bottom");
    expect(ruleBody(css, "  .v2-toolbar")).toContain("margin-bottom: var(--spacing-v2-block-gap);");
    expect(ruleBody(css, "  .v2-toolbar")).toContain("position: sticky;");
  });

  it("T3: forward and reverse move the content area; crossfade names Main and Toolbar only", () => {
    expect(ruleBody(css, ".v2-main")).not.toContain("view-transition-name");
    expect(css).toContain('html[data-v2-transition="forward"] .mllg-content-area:has([data-v2-layout])');
    expect(css).toContain('html[data-v2-transition="reverse"] .mllg-content-area:has([data-v2-layout])');
    expect(ruleBody(css, 'html[data-v2-transition="crossfade"] .v2-main')).toContain("view-transition-name: v2-main;");
    expect(ruleBody(css, 'html[data-v2-transition="crossfade"] .v2-toolbar')).toContain(
      "view-transition-name: v2-toolbar;",
    );
    expect(css).toContain('html[data-v2-transition="forward"]::view-transition-new(v2-content) {');
    expect(css).toContain('html[data-v2-transition="reverse"]::view-transition-old(v2-content) {');
    expect(css).not.toContain('forward"]::view-transition-new(v2-main)');
    expect(css).toMatch(/group\(v2-content\)[^{]*\{\s*animation: none;/);
  });

  it("T3: the 1.x transition rules are still present and unchanged in name", () => {
    expect(css).toContain(
      'html[data-mllg-view-transition-direction="forward"]::view-transition-old(mllg-content-area) {',
    );
    expect(css).toContain(
      'html[data-mllg-view-transition-direction="reverse"]::view-transition-new(mllg-content-area) {',
    );
    expect(css).toContain(".mllg-view-transition-content {\n  view-transition-name: mllg-content-area;\n}");
  });

  it("T7: the first-paint active-tab bar is CSS and stops once the indicator is measured", () => {
    expect(ruleBody(css, ".v2-tab-active::after")).toContain("background-color: var(--color-v2-fg);");
    expect(ruleBody(css, '.v2-tabs[data-indicator-ready="true"] .v2-tab-active::after')).toContain("content: none;");
  });
});

describe("corr-3 layout CSS", () => {
  it("U1: the mobile clip rule is removed from every transition", () => {
    expect(css).not.toContain("clip-path: inset(var(--mobile-header-height)");
    expect(css).not.toContain("clip-path: inset(");
  });

  it("U2: the 1.x mobile header and bottom nav get scoped names only on v2 transitions below lg", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 63.999rem) {", css.indexOf(".v2-action-bar")));
    expect(mobile).toContain("view-transition-name: v2-shell-header;");
    expect(mobile).toContain("view-transition-name: v2-shell-nav;");
    expect(
      ruleBody(css, "html[data-v2-transition]:has([data-v2-layout]) header.fixed.top-0:not([data-v2-layout] *)"),
    ).toContain("view-transition-name: v2-shell-header;");
    expect(
      ruleBody(
        css,
        'html[data-v2-transition]:has([data-v2-layout]) nav[aria-label="주요 메뉴"]:not([data-v2-layout] *)',
      ),
    ).toContain("view-transition-name: v2-shell-nav;");
  });

  it("U2: the shell groups and snapshots do not animate and sit above the v2 content groups", () => {
    expect(css).toMatch(/group\(v2-shell-header\)[^{]*\{\s*animation: none;\s*z-index: 2;/);
    expect(css).toMatch(/group\(v2-shell-nav\)[^{]*\{\s*animation: none;\s*z-index: 2;/);
    expect(css).toMatch(/old\(v2-shell-header\)[^{]*\{\s*animation: none;/);
    expect(css).toMatch(/new\(v2-shell-header\)[^{]*\{\s*animation: none;/);
    expect(css).toMatch(/old\(v2-shell-nav\)[^{]*\{\s*animation: none;/);
    expect(css).toMatch(/new\(v2-shell-nav\)[^{]*\{\s*animation: none;/);
    expect(ruleBody(css, 'html[data-v2-transition="crossfade"]::view-transition-group(v2-toolbar)')).toContain(
      "z-index: 1;",
    );
  });

  it("U2: the 1.x transition rules do not reference the v2 shell names", () => {
    const legacy = css.slice(
      css.indexOf('html[data-mllg-view-transition-direction="forward"]'),
      css.indexOf("/* 2.0 screen transitions"),
    );
    expect(legacy).not.toContain("v2-shell");
  });
});

describe("corr-4 layout motion, spacing, and tab geometry", () => {
  it("V1: the measured indicator takes the active box's width directly and only translates", () => {
    expect(tabsSource).not.toContain("scaleX");
    expect(tabsSource).not.toContain("w-24");
    expect(tabsSource).toMatch(/width: `calc\(\$\{indicator\.width\}px - 1\.5rem\)`/);
    expect(tabsSource).toMatch(/transform: `translateX\(calc\(\$\{indicator\.x\}px \+ 0\.75rem\)\)`/);
    expect(tabsSource).toContain("z-10");
  });

  it("V1: the CSS first-paint bar spans the whole active tab box", () => {
    const bar = ruleBody(css, ".v2-tab-active::after");
    expect(bar).toContain("left: 0.75rem;");
    expect(bar).toContain("right: 0.75rem;");
    expect(bar).toContain("bottom: 0;");
  });

  it("V2: the sheet panel transitions translate for enter and leave", () => {
    expect(sheetSource).toContain('enter="transition-[translate,opacity] duration-v2-slow ease-v2-enter"');
    expect(sheetSource).toContain('leave="transition-[translate,opacity] duration-v2-base ease-v2-exit"');
    expect(sheetSource).not.toContain("transition-[transform,opacity]");
  });

  it("V2: only the sheet and the chevron use translate, scale, or rotate utilities, each with a matching transition", () => {
    const componentRoot = join(process.cwd(), "app/components/v2");
    const tsxFiles = readdirSync(componentRoot, { recursive: true, encoding: "utf8" }).filter((file) =>
      file.endsWith(".tsx"),
    );
    const motionUtility = /\b(?:translate|scale|rotate)-/;
    const usingFiles = tsxFiles.filter((file) => motionUtility.test(readFileSync(join(componentRoot, file), "utf8")));
    expect(usingFiles.sort()).toEqual(["layout/PanelSheet.tsx", "primitives/Sheet.tsx"]);
    // Tailwind v4 transition-transform lists translate, scale, and rotate, so the chevron's rotate animates.
    expect(panelSource).toContain(
      '"size-4 shrink-0 text-v2-fg-tertiary motion-safe:transition-transform duration-v2-base ease-v2-standard"',
    );
    expect(panelSource).toContain('phase === "open" && "rotate-180"');
  });

  it("V3: the panel section uses px and py spacing, and only the collapsible header keeps the row minimum", () => {
    expect(panelSource).toContain('className="relative rounded-lg bg-v2-surface px-v2-block-p py-4"');
    expect(panelSource).not.toMatch(/\sp-v2-block-p/);
    expect(panelSource).toContain('className={cn("flex gap-2", togglesBody ? "items-center" : "items-start")}');
    expect(panelSource.split("min-h-v2-row-min").length - 1).toBe(1);
  });

  it("V4: the gutter matches the root padding and drives the stacked toolbar bleed", () => {
    expect(ruleBody(css, "[data-v2-layout]")).toContain("--v2-gutter: 1rem;");
    expect(css).toMatch(/@media \(width >= 48rem\) \{\s*\[data-v2-layout\] \{\s*--v2-gutter: 2rem;/);
    const stackedToolbar = ruleBody(css, "  .v2-toolbar");
    expect(stackedToolbar).toContain("margin-inline: calc(var(--v2-gutter) * -1);");
    expect(stackedToolbar).toContain("padding-inline: 0;");
    expect(stackedToolbar).toContain("position: sticky;");
    expect(ruleBody(css, "  .v2-tabs")).toContain("margin-left: 0;");
    expect(ruleBody(css, "  .v2-tabs")).toContain("flex: 1 1 auto;");
    expect(ruleBody(css, "  .v2-tabs-list")).toContain("padding-inline: var(--v2-gutter);");
    expect(tabsSource).toContain("v2-tabs-list");
  });

  it("V4: the desktop tab margin sits before the stacked override, so the stacked rule wins", () => {
    expect(ruleBody(css, "\n.v2-tabs")).toContain("margin-left: -0.75rem;");
    expect(css.indexOf("\n.v2-tabs {")).toBeLessThan(css.indexOf("@container page-available (width < 48rem) {"));
  });
});

describe("corr-5 control border token, docs, and gutter comment", () => {
  it("W1: the first-paint bar and the measured indicator are both inset by the tab's px-3", () => {
    expect(ruleBody(css, ".v2-tab-active::after")).toContain("left: 0.75rem;");
    expect(tabsSource).toMatch(/calc\(\$\{indicator\.width\}px - 1\.5rem\)/);
    expect(tabsSource).toMatch(/translateX\(calc\(\$\{indicator\.x\}px \+ 0\.75rem\)\)/);
  });

  it("W2: the control border token is defined for light and dark and exposed to utilities", () => {
    const lightStart = css.indexOf("--v2-inset: oklch(0.955 0 0);");
    expect(css.slice(lightStart, css.indexOf("}", lightStart))).toContain("--v2-control-border: oklch(0.64 0 0);");
    const darkStart = css.indexOf("--v2-inset: oklch(0.25 0 0);");
    expect(css.slice(darkStart, css.indexOf("}", darkStart))).toContain("--v2-control-border: oklch(0.52 0 0);");
    expect(css).toContain("--color-v2-control-border: var(--v2-control-border);");
  });

  it("W2: the docs use the control border, not the inset surface", () => {
    const docs = readFileSync(join(process.cwd(), "docs/frontend/design-system-v2.md"), "utf8");
    expect(docs).toContain(
      "| `border-v2-control-border` | `oklch(0.64 0 0)` | `oklch(0.52 0 0)` | Borders of text inputs, selects, textareas, and dense data boundaries (3:1 or higher against surface and canvas). Not for cards, buttons, or region separation. |",
    );
    expect(docs).toContain("- Radius tokens. Keep the 1.x base radius");
    expect(docs).not.toContain("Border and radius tokens");
  });

  it("W3: the gutter comment says the gutter is viewport-based and stacking is container-based", () => {
    expect(css).toContain(
      "/* The gutter mirrors the root container padding (px-4 md:px-8). It is viewport-based; stacking is container-based. */",
    );
  });
});

describe("corr-6 status tokens, PanelAction, and docs", () => {
  it("C15: danger status tokens are defined for light and dark and exposed to utilities", () => {
    const lightStart = css.indexOf("--v2-success-subtle: oklch(0.982 0.018 155.826);");
    const lightBlock = css.slice(lightStart, css.indexOf("}", lightStart));
    expect(lightBlock).toContain("--v2-danger: oklch(0.505 0.213 27.518);");
    expect(lightBlock).toContain("--v2-danger-subtle: oklch(0.971 0.013 17.38);");

    const darkStart = css.indexOf("--v2-success-subtle: oklch(0.266 0.065 152.934);");
    const darkBlock = css.slice(darkStart, css.indexOf("}", darkStart));
    expect(darkBlock).toContain("--v2-danger: oklch(0.704 0.191 22.216);");
    expect(darkBlock).toContain("--v2-danger-subtle: oklch(0.258 0.092 26.042);");

    expect(css).toContain("--color-v2-danger: var(--v2-danger);");
    expect(css).toContain("--color-v2-danger-subtle: var(--v2-danger-subtle);");
    // The Aside and the 1.x live color keep their values; danger is a separate token with the same light value.
    expect(css).toContain("--v2-live: oklch(0.505 0.213 27.518);");
  });

  it("C15: the pointer-coarse variant used for the touch hit area is defined", () => {
    expect(css).toContain("@custom-variant pointer-coarse (@media (pointer: coarse));");
  });

  it("C15: PanelAction uses tokens only, with no literal colors", () => {
    const panelActionSource = readFileSync(join(process.cwd(), "app/components/v2/layout/PanelAction.tsx"), "utf8");
    expect(panelActionSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(|hsla?\(/);
    expect(panelActionSource).toContain("bg-v2-danger-subtle text-v2-danger");
    expect(panelActionSource).toContain("disabled:cursor-not-allowed");
  });

  it("C15: the docs list the danger tokens, state the status rule, and drop danger from Not added yet", () => {
    const docs = readFileSync(join(process.cwd(), "docs/frontend/design-system-v2.md"), "utf8");
    expect(docs).toContain("| `text-v2-danger` | `oklch(0.505 0.213 27.518)` | `oklch(0.704 0.191 22.216)` |");
    expect(docs).toContain("| `bg-v2-danger-subtle` | `oklch(0.971 0.013 17.38)` | `oklch(0.258 0.092 26.042)` |");
    expect(docs).toContain("- `danger` is status.");
    expect(docs).toContain("Always pair it with a verb label");
    expect(docs).toContain("Show the action only when there is something to clear.");
    expect(docs).toContain("- Status: info, warning, and neutral.");
    expect(docs).toContain('<PanelAction variant="danger" onClick={clearFilters}>초기화</PanelAction>');
  });
});

describe("corr-7 header action box and docs", () => {
  it("X1: the header action sits in a one-title-line box, so the header row height never depends on the action", () => {
    // h-5 (1.25rem) is the title line height of text-sm, so the 28px action overflows the box without adding to the row.
    expect(panelSource).toContain(
      '{headerAction ? <div className="flex h-5 shrink-0 items-center">{headerAction}</div> : null}',
    );
    expect(panelSource).toContain('togglesBody ? "items-center" : "items-start"');
  });

  it("X2: the PanelAction guidance says where focus goes after an action hides itself", () => {
    const docs = readFileSync(join(process.cwd(), "docs/frontend/design-system-v2.md"), "utf8");
    expect(docs).toContain("move focus to the panel heading or the first control so keyboard focus is not lost");
  });
});

describe("corr-8 docs and tab bar motion", () => {
  it("F3: the docs say the tab bar moves between link tabs only when ScreenTabs stays mounted", () => {
    const docs = readFileSync(join(process.cwd(), "docs/frontend/design-system-v2.md"), "utf8");
    expect(docs).toContain("the tab bar moves between routes only when `ScreenTabs` stays mounted across them");
    expect(docs).toContain("Put the tabs in a shared parent layout route.");
  });
});

describe("corr-2 component values", () => {
  it("T4: the sheet panel slides only; opacity changes only under reduced motion", () => {
    for (const name of ["enterFrom", "enterTo", "leaveFrom", "leaveTo"]) {
      const value = panelTransitionValue(sheetSource, name).replace(/motion-reduce:opacity-(0|100)/g, "");
      expect(value).not.toContain("opacity-");
      expect(value).toContain("translate-y-");
    }
    expect(panelTransitionValue(sheetSource, "enterFrom")).toContain("motion-reduce:opacity-0");
  });

  it("T5: sheet header, body padding, and close icon use the designer values", () => {
    expect(sheetSource).toContain("flex shrink-0 items-center justify-between gap-3 pt-2 pr-2 pl-v2-block-p");
    expect(sheetSource).toContain(
      "min-h-0 overflow-y-auto overscroll-contain px-v2-block-p pt-1 pb-[max(env(safe-area-inset-bottom),1rem)]",
    );
    expect(sheetSource).toContain('<XMarkIcon className="size-5" aria-hidden="true" />');
    expect(sheetSource).toContain("flex size-11 items-center justify-center rounded-md");
    expect(sheetSource).toContain("max-h-[85dvh]");
    expect(sheetSource).toContain("rounded-t-lg bg-v2-surface");
  });

  it("T6: the collapsible header button bleeds into the panel padding by the row inset", () => {
    expect(panelSource).toContain(
      "-mx-v2-row-x flex min-h-v2-row-min min-w-0 flex-1 items-center gap-2 rounded-md px-v2-row-x",
    );
  });
});
