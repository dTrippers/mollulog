import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "@jest/globals";

const appRoot = join(process.cwd(), "app");
const tailwindSource = readFileSync(join(appRoot, "tailwind.css"), "utf8");
const filterButtonsSource = readFileSync(join(appRoot, "components/primitives/FilterButtons.tsx"), "utf8");
const mainStorySource = readFileSync(join(appRoot, "routes/mainstory.tsx"), "utf8");
const panelOptionGroupSource = readFileSync(join(appRoot, "components/primitives/PanelOptionGroup.tsx"), "utf8");
const rootSource = readFileSync(join(appRoot, "root.tsx"), "utf8");
const pageSource = readFileSync(join(appRoot, "components/features/layout/Page.tsx"), "utf8");
const pageLinkSource = readFileSync(join(appRoot, "components/features/layout/PageLink.tsx"), "utf8");
const pageScreenSelectorSource = readFileSync(
  join(appRoot, "components/features/layout/PageScreenSelector.tsx"),
  "utf8",
);
const growthTableSource = readFileSync(join(appRoot, "routes/utils.growth._components/GrowthTable.tsx"), "utf8");
const pagePanelSource = readFileSync(join(appRoot, "components/features/layout/PagePanel.tsx"), "utf8");
const panelBodySource = readFileSync(join(appRoot, "components/primitives/PanelBody.tsx"), "utf8");
const panelBodyControlsSource = readFileSync(join(appRoot, "components/primitives/PanelBodyControls.tsx"), "utf8");
const eventSelectorSource = readFileSync(join(appRoot, "components/features/events/EventSelector.tsx"), "utf8");
const relationshipStudentPickerSource = readFileSync(
  join(appRoot, "components/features/relationship/RelationshipStudentPicker.tsx"),
  "utf8",
);

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

describe("design system source guard", () => {
  it("keeps the light and dark page/card luminance hierarchy", () => {
    expect(themeBlock(":root")).toContain("--background: oklch(0.985 0 0);");
    expect(themeBlock(":root")).toContain("--card: oklch(1 0 0);");
    expect(themeBlock(":root")).toContain("--sidebar: oklch(1 0 0);");
    expect(themeBlock(".dark")).toContain("--background: oklch(0.269 0 0);");
    expect(themeBlock(".dark")).toContain("--card: oklch(0.235 0 0);");
    expect(themeBlock(".dark")).toContain("--sidebar: oklch(0.235 0 0);");
  });

  it("keeps stand-alone filters and main story lists distinct from the light canvas", () => {
    expect(filterButtonsSource).toContain('surface = "panel"');
    expect(filterButtonsSource).toContain("bg-card text-foreground shadow-sm shadow-black/5");
    expect(filterButtonsSource).toContain("bg-muted text-foreground hover:bg-foreground/10");
    expect(filterButtonsSource).toContain("before:inset-y-0 before:left-0 before:w-1");
    expect(filterButtonsSource).toContain("dark:bg-muted dark:shadow-none");
    expect(mainStorySource).toContain('surface="page"');
    expect(mainStorySource).not.toContain("bg-neutral-50 dark:bg-neutral-900");
    expect(mainStorySource).toContain("divide-y divide-border overflow-hidden rounded-lg bg-card shadow-md");
  });

  it("keeps surface radii at rounded-lg or smaller", () => {
    expect(findViolations(/rounded(?:-[trbl]{1,2})?-(?:xl|[2-9]xl)\b/)).toEqual([]);
  });

  it("keeps nested panel options distinct and page widths left-aligned", () => {
    expect(panelOptionGroupSource).toContain('emphasis = "subtle"');
    expect(panelOptionGroupSource).toContain("bg-primary text-primary-foreground hover:bg-primary/90");
    expect(panelOptionGroupSource).toContain("bg-primary/10 text-primary hover:bg-primary/15");
    expect(panelOptionGroupSource).toContain("bg-muted text-foreground shadow-sm shadow-black/5 hover:bg-muted/80");
    expect(rootSource).toContain("mx-auto w-full max-w-7xl");
    expect(rootSource).not.toContain("pageWidthClassName");
    expect(rootSource).not.toContain("transition-[max-width]");
  });

  it("keeps Page side rail roles, spacing, and clipped table corners consistent", () => {
    expect(pageScreenSelectorSource).toContain("bg-primary/10 text-primary shadow-sm shadow-black/5");
    expect(pageLinkSource).toContain("w-full items-center justify-between gap-3 rounded-lg bg-card");
    expect(pageLinkSource).toContain("group block w-full");
    expect(pageSource).toContain('<div className="space-y-3">');
    expect(pageSource).toContain('panels && panels.length > 0 && "mt-8"');
    expect(growthTableSource).toContain("inline-block overflow-hidden rounded-lg border border-border align-top");
  });

  it("keeps Page Panel headers and body typography consistent", () => {
    expect(pagePanelSource).toContain('expanded && "border-b border-border/70 pb-3"');
    expect(pagePanelSource).toContain('className="pt-3 text-sm text-foreground/85"');
    expect(panelBodySource).toContain("text-xs font-semibold text-muted-foreground");
    expect(panelBodySource).toContain("text-sm font-normal text-foreground/85");
    expect(panelBodySource).toContain("mt-0.5 truncate text-xs text-muted-foreground");
    expect(panelBodyControlsSource).toContain("export function PanelActionRow");
    expect(panelBodyControlsSource).toContain("export function PanelIconToggleRow");
    expect(panelBodyControlsSource).toContain("export function PanelSwitchRow");
    expect(panelBodyControlsSource).toContain("export function PanelFilterButtonsSection");
    expect(panelBodyControlsSource).toContain("export function PanelFilterButtonRow");
    expect(panelBodyControlsSource).toContain("export function PanelSearchField");
    expect(eventSelectorSource).toContain("export function PanelEventSelector");
    expect(eventSelectorSource).toContain("border-0 bg-transparent shadow-none hover:bg-muted/70");
    expect(relationshipStudentPickerSource).toContain("max-w-none border-0 bg-transparent");
    expect(relationshipStudentPickerSource).toContain('selected ? "bg-primary/10 hover:bg-primary/15"');
  });

  it("does not reintroduce removed color and list button variants", () => {
    expect(findViolations(/(?:tint-blue|tint-red|variant=["']list["']|size=["']list["'])/)).toEqual([]);
  });
});
