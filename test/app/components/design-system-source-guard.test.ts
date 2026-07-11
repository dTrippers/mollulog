import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "@jest/globals";

const appRoot = join(process.cwd(), "app");
const tailwindSource = readFileSync(join(appRoot, "tailwind.css"), "utf8");
const filterButtonsSource = readFileSync(join(appRoot, "components/primitives/FilterButtons.tsx"), "utf8");
const pageSource = readFileSync(join(appRoot, "components/features/layout/Page.tsx"), "utf8");
const panelBodyControlsSource = readFileSync(join(appRoot, "components/primitives/PanelBodyControls.tsx"), "utf8");
const eventSelectorSource = readFileSync(join(appRoot, "components/features/events/EventSelector.tsx"), "utf8");

const sharedSurfaceFiles = [
  "components/primitives/FilterButtons.tsx",
  "components/primitives/PanelBody.tsx",
  "components/primitives/PanelBodyControls.tsx",
  "components/primitives/SectionCard.tsx",
  "components/features/layout/Page.tsx",
  "components/features/layout/PageLink.tsx",
  "components/features/layout/PagePanel.tsx",
  "components/features/layout/PageScreenSelector.tsx",
];

function themeBlock(selector: string): string {
  const blockStart = tailwindSource.indexOf(`${selector} {`);
  const blockEnd = tailwindSource.indexOf("\n}", blockStart);
  return tailwindSource.slice(blockStart, blockEnd);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function findViolations(pattern: RegExp): string[] {
  return sourceFiles(appRoot).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return source
      .split("\n")
      .flatMap((line, index) => (pattern.test(line) ? [`${relative(process.cwd(), path)}:${index + 1}`] : []));
  });
}

function findFileViolations(paths: string[], pattern: RegExp): string[] {
  return paths.flatMap((path) => {
    const source = readFileSync(join(appRoot, path), "utf8");
    return source.split("\n").flatMap((line, index) => (pattern.test(line) ? [`app/${path}:${index + 1}`] : []));
  });
}

describe("design system source guard", () => {
  it("keeps the light and dark page/card luminance hierarchy", () => {
    expect(themeBlock(":root")).toContain("--background: oklch(0.985 0 0);");
    expect(themeBlock(":root")).toContain("--card: oklch(1 0 0);");
    expect(themeBlock(":root")).toContain("--sidebar: oklch(1 0 0);");
    expect(themeBlock(".dark")).toContain("--background: oklch(0.269 0 0);");
    expect(themeBlock(".dark")).toContain("--card: oklch(0.235 0 0);");
    expect(themeBlock(".dark")).toContain("--sidebar: oklch(0.235 0 0);");
  });

  it("keeps FilterButtons surface composition explicit", () => {
    expect(filterButtonsSource).toContain('surface?: "page" | "panel"');
    expect(filterButtonsSource).toContain('surface = "panel"');
    expect(filterButtonsSource).toContain('surface === "page"');
  });

  it("keeps surface radii at rounded-lg or smaller", () => {
    expect(findViolations(/rounded(?:-[trbl]{1,2})?-(?:xl|[2-9]xl)\b/)).toEqual([]);
  });

  it("keeps shared structural surfaces on semantic color tokens", () => {
    expect(findFileViolations(sharedSurfaceFiles, /(?:bg|text|border|from|via|to|ring|shadow)-neutral-/)).toEqual([]);
  });

  it("keeps panel controls available as purpose-specific compositions", () => {
    expect(panelBodyControlsSource).toContain("export function PanelActionRow");
    expect(panelBodyControlsSource).toContain("export function PanelIconToggleRow");
    expect(panelBodyControlsSource).toContain("export function PanelSwitchRow");
    expect(panelBodyControlsSource).toContain("export function PanelFilterButtonsSection");
    expect(panelBodyControlsSource).toContain("export function PanelFilterButtonRow");
    expect(panelBodyControlsSource).toContain("export function PanelSearchField");
    expect(eventSelectorSource).toContain("export function PanelEventSelector");
  });

  it("shares one responsive Page tab item implementation", () => {
    expect(pageSource).toContain("function ResponsiveTabItem");
    expect(pageSource).not.toContain("function MobileTabItem");
    expect(pageSource).not.toContain("function VerticalDesktopTabItem");
  });

  it("does not reintroduce removed color and list button variants", () => {
    expect(findViolations(/(?:tint-blue|tint-red|variant=["']list["']|size=["']list["'])/)).toEqual([]);
  });
});
