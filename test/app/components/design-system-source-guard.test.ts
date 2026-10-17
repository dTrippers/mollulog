import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "@jest/globals";

const appRoot = join(process.cwd(), "app");
const tailwindSource = readFileSync(join(appRoot, "tailwind.css"), "utf8");

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
    expect(themeBlock(".dark")).toContain("--sidebar: oklch(0.215 0 0);");
  });

  it("keeps surface radii at rounded-lg or smaller", () => {
    expect(findViolations(/rounded(?:-[trbl]{1,2})?-(?:xl|[2-9]xl)\b/)).toEqual([]);
  });

  it("keeps shared structural surfaces on semantic color tokens", () => {
    expect(findFileViolations(sharedSurfaceFiles, /(?:bg|text|border|from|via|to|ring|shadow)-neutral-/)).toEqual([]);
  });

  it("does not reintroduce removed color and list button variants", () => {
    expect(findViolations(/(?:tint-blue|tint-red|variant=["']list["']|size=["']list["'])/)).toEqual([]);
  });
});

const v2Root = "components/v2";
// Migrated route files (relative to app/) join the 2.0 guard here. The list starts empty.
const migratedRouteFiles: string[] = [
  "routes/futures.tsx",
  "routes/futures._components/futures-navigation.ts",
  "routes/futures._components/futures-view-state.ts",
  "routes/futures._components/use-futures-navigation.ts",
  "routes/futures._components/recruitment-opinion-tutorial.ts",
  "routes/futures._components/viewer-state.ts",
  "routes/_index.tsx",
  "routes/_index._components/home-format.ts",
  "routes/_index._components/home-viewer-state.ts",
  "routes/_index._components/HomePrimitives.tsx",
  "routes/_index._components/HomeEventSection.tsx",
  "routes/_index._components/HomeRecruitmentSection.tsx",
  "routes/_index._components/HomeRaidSection.tsx",
  "routes/_index._components/HomeContentSection.tsx",
  "routes/_index._components/HomeBottomSection.tsx",
  "routes/_index._components/HomeAside.tsx",
  "routes/_index._components/HomeSkeleton.tsx",
  "routes/_index._components/HomeHeader.tsx",
  "routes/_index._components/HomeMain.tsx",
  "routes/utils.relationship.tsx",
  "routes/utils.relationship._components/RelationshipGiftScreen.tsx",
  "routes/utils.relationship._components/RelationshipStudentScreen.tsx",
  "routes/utils.relationship._components/relationship-types.ts",
  "routes/utils.relationship._components/use-relationship-student-items.ts",
];
// Allowed exceptions: the file, the line pattern, and the reason. The list starts empty.
const v2GuardExceptions: { file: string; pattern: RegExp; reason: string }[] = [];

const colorPrefixes =
  "ring-offset|border-[trblxyse]|bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow";
const utilityValue = new RegExp(`(?<![\\w-])(?:${colorPrefixes})-(\\[[^\\]]*\\]|\\w[\\w./%-]*)`, "g");
const hues =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const semanticColors =
  "background|foreground|(?:card|popover|primary|secondary|muted|accent)(?:-foreground)?|destructive|border|input|ring|sidebar(?:-[a-z]+)*|chart-\\d|floating(?:-[a-z]+)*";
const forbiddenColorValue = new RegExp(`^(?:white|black|(?:${hues})(?:-\\d{2,3})?|${semanticColors})(?:\\/[\\d.]+)?$`);
// CSS named colors. A bracket value that is one of these (for example `bg-[red]`) is a color; other keywords such as `thin` are not.
const cssColorKeywords =
  "aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen";
const namedColorValue = new RegExp(`^\\[(?:${cssColorKeywords})\\]$`, "i");
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?|color-mix)\(/;
const literalDuration = /\b\d+(?:\.\d+)?(?:ms|s)\b/;
const cubicBezier = /cubic-bezier\(/;
const utilityDuration = /(?<![\w-])duration-(?:\d|\[)/;
const utilityEase = /(?<![\w-])ease-(?:linear|in|out|in-out|\[)/;
const importSpecifier = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
// 1.x color variables (semantic names, `--color-<hue>-<shade>`, white, black) referenced through var().
// Also matches the Tailwind 4 shorthand `prefix-(--name)` and `prefix-(color:--name)`.
const colorVariable = new RegExp(
  `(?:var\\(|(?<![\\w-])(?:${colorPrefixes})-\\()\\s*(?:color:)?--(?:color-)?(?:${semanticColors}|white|black|(?:${hues})(?:-\\d{2,3})?)\\s*[,)]`,
);

function v2SourceFiles(): string[] {
  return sourceFiles(join(appRoot, v2Root)).map((path) => relative(appRoot, path).split(sep).join("/"));
}

function guardedFiles(): string[] {
  return [...v2SourceFiles(), ...migratedRouteFiles];
}

function isForbiddenImport(file: string, specifier: string): boolean {
  const target = specifier.startsWith("~/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? relative(appRoot, resolve(appRoot, dirname(file), specifier))
      : "";
  return /^components\/(?:primitives|features)(?:\/|$)/.test(target.split(sep).join("/"));
}

function isForbiddenColor(value: string): boolean {
  if (!value.startsWith("[")) {
    return forbiddenColorValue.test(value);
  }
  // A `color:` type hint is allowed only when it points at a v2 variable.
  const typeHint = value.startsWith("[color:") && !/^\[color:(?:var\()?--(?:color-)?v2-/.test(value);
  return typeHint || colorLiteral.test(value) || namedColorValue.test(value);
}

function hasStyleViolation(line: string): boolean {
  if (colorLiteral.test(line) || literalDuration.test(line) || cubicBezier.test(line)) {
    return true;
  }
  if (colorVariable.test(line) || utilityDuration.test(line) || utilityEase.test(line)) {
    return true;
  }
  return [...line.matchAll(utilityValue)].some(([, value]) => isForbiddenColor(value));
}

function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function findSourceViolations(file: string, source: string, exceptions = v2GuardExceptions): string[] {
  const lines = source.split("\n");
  // Imports are matched over the whole source. The reported line is the one holding the module path.
  const importLines = [...source.matchAll(importSpecifier)].flatMap((match) => {
    const specifier = match[1];
    const offset = (match.index ?? 0) + match[0].length - 1 - specifier.length;
    return isForbiddenImport(file, specifier) ? [lineOf(source, offset)] : [];
  });
  const styleLines = lines.flatMap((line, index) => (hasStyleViolation(line) ? [index + 1] : []));
  return [...new Set([...importLines, ...styleLines])]
    .sort((a, b) => a - b)
    .filter((line) => !exceptions.some((item) => item.file === file && item.pattern.test(lines[line - 1])))
    .map((line) => `app/${file}:${line}`);
}

function findGuardViolations(): string[] {
  return guardedFiles().flatMap((file) => findSourceViolations(file, readFileSync(join(appRoot, file), "utf8")));
}

const importViolationFixtures: [string, string][] = [
  ["components/v2/features/Fixture.tsx", `import { Button } from "~/components/primitives/Button";`],
  ["components/v2/layout/Fixture.tsx", `import { Panel } from "../../primitives/Panel";`],
  ["components/v2/features/Fixture.tsx", `const Card = lazy(() => import("~/components/features/students/Card"));`],
  ["routes/fixture.tsx", `export { Page } from "~/components/features/layout/Page";`],
  ["routes/fixture.tsx", `import "../components/primitives/SectionCard";`],
  [
    "components/v2/features/Fixture.tsx",
    `const Card = lazy(() => import(\n  "~/components/features/students/StudentCard"\n));`,
  ],
  ["components/v2/features/Fixture.tsx", `import { Button } from\n  "~/components/primitives/Button";`],
];

const styleViolationFixtures: [string, string][] = [
  ["components/v2/features/Fixture.tsx", `<div className="bg-neutral-100" />`],
  ["components/v2/features/Fixture.tsx", `<p className="text-red-500" />`],
  ["components/v2/features/Fixture.tsx", `<p className="text-white" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-card text-muted-foreground" />`],
  ["components/v2/features/Fixture.tsx", `<div className="border-border" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-[#fff]" />`],
  ["components/v2/features/Fixture.tsx", `<p className="text-[oklch(0.5_0_0)]" />`],
  ["components/v2/features/Fixture.tsx", `<div className="shadow-black/10" />`],
  ["components/v2/features/Fixture.tsx", `<div className="ring-primary" />`],
  ["components/v2/features/Fixture.tsx", `<div className="duration-200" />`],
  ["components/v2/features/Fixture.tsx", `<div className="duration-[200ms]" />`],
  ["components/v2/features/Fixture.tsx", `<div className="ease-in" />`],
  ["components/v2/features/Fixture.tsx", `<div className="ease-[cubic-bezier(0,0,0,1)]" />`],
  ["components/v2/features/Fixture.tsx", `<div style={{ color: "#fff" }} />`],
  ["components/v2/features/Fixture.css", `  color: #fff;`],
  ["components/v2/features/Fixture.css", `  background: oklch(0.5 0 0);`],
  ["components/v2/features/Fixture.css", `  transition: opacity 200ms ease;`],
  ["components/v2/features/Fixture.css", `  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);`],
  ["routes/fixture.tsx", `<div className="bg-neutral-50" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-[var(--card)]" />`],
  ["components/v2/features/Fixture.tsx", `<p className="text-[var(--color-neutral-500)]" />`],
  ["components/v2/features/Fixture.css", `  color: var(--muted-foreground);`],
  ["components/v2/features/Fixture.css", `  background: var(--color-red-500);`],
  ["components/v2/features/Fixture.tsx", `<div className="border-t-red-500" />`],
  ["components/v2/features/Fixture.tsx", `<div className="border-x-border" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-[red]" />`],
  ["components/v2/features/Fixture.tsx", `<p className="text-[color:rebeccapurple]" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-(--card)" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-(color:--muted)" />`],
];

const allowedFixtures: [string, string][] = [
  [
    "components/v2/features/Fixture.tsx",
    `<div className="bg-v2-canvas text-v2-fg-tertiary ring-v2-focus outline-v2-focus" />`,
  ],
  ["components/v2/features/Fixture.tsx", `<div className="bg-transparent text-current border-inherit" />`],
  ["components/v2/layout/Fixture.tsx", `<div className="py-v2-row-y gap-v2-block-gap min-h-v2-row-min" />`],
  ["components/v2/layout/Fixture.tsx", `<div className="duration-v2-base ease-v2-enter shadow-lg border-2 text-sm" />`],
  ["components/v2/features/Fixture.css", `  outline: 2px solid var(--v2-focus);`],
  ["components/v2/features/Fixture.css", `  transition-duration: var(--transition-duration-v2-base);`],
  ["components/v2/features/Fixture.tsx", `import { Stack } from "~/components/v2/layout/Stack";`],
  ["components/v2/features/Fixture.tsx", `import { Row } from "./Row";`],
  ["components/v2/layout/Fixture.tsx", `import { formatDate } from "~/lib/date";`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-[var(--v2-canvas)]" />`],
  ["components/v2/features/Fixture.css", `  padding-bottom: var(--mobile-nav-height);`],
  ["components/v2/features/Fixture.tsx", `<div className="border-t-v2-inset" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-(--v2-surface)" />`],
  ["components/v2/features/Fixture.tsx", `<p className="text-[13px] border-[1.5px]" />`],
  ["components/v2/features/Fixture.tsx", `<div className="bg-[url(/a.png)]" />`],
  ["components/v2/features/Fixture.tsx", `<div className="border-[thin] bg-[transparent]" />`],
];

describe("design system 2.0 source guard", () => {
  it("keeps 2.0 files off 1.x components and non-v2 colors, durations, and easings", () => {
    expect(findGuardViolations()).toEqual([]);
  });

  it("flags 1.x imports and non-v2 styling in 2.0 and migrated-route sources", () => {
    const missed = [...importViolationFixtures, ...styleViolationFixtures]
      .filter(([file, source]) => findSourceViolations(file, source).length === 0)
      .map(([file, source]) => `${file}: ${source}`);
    expect(missed).toEqual([]);
  });

  it("accepts v2 tokens, v2 imports, and allowed literals", () => {
    expect(allowedFixtures.flatMap(([file, source]) => findSourceViolations(file, source))).toEqual([]);
  });

  it("applies an exception only to its listed file and pattern", () => {
    const exceptions = [{ file: "components/v2/features/Fixture.tsx", pattern: /bg-card/, reason: "fixture" }];
    const source = `<div className="bg-card" />`;
    expect(findSourceViolations("components/v2/features/Fixture.tsx", source, exceptions)).toEqual([]);
    expect(findSourceViolations("routes/fixture.tsx", source, exceptions)).toHaveLength(1);
  });

  it("reports the line that holds the module path of a multi-line import", () => {
    const source = `import { Button } from\n  "~/components/primitives/Button";`;
    expect(findSourceViolations("components/v2/features/Fixture.tsx", source)).toEqual([
      "app/components/v2/features/Fixture.tsx:2",
    ]);
  });
});
