import { describe, expect, it } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const appRoot = join(process.cwd(), "app");

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
  it("keeps surface radii at rounded-lg or smaller", () => {
    expect(findViolations(/rounded(?:-[trbl]{1,2})?-(?:xl|[2-9]xl)\b/)).toEqual([]);
  });

  it("does not reintroduce removed color and list button variants", () => {
    expect(findViolations(/(?:tint-blue|tint-red|variant=["']list["']|size=["']list["'])/)).toEqual([]);
  });
});
