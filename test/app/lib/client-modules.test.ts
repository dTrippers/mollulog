import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const appDirectory = join(__dirname, "../../../app");

function listClientModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listClientModules(path);
    return /\.client\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("client-only modules", () => {
  // React Router replaces `.client` modules with empty exports in the server build, so a hook
  // exported from one becomes `undefined()` during SSR and fails every page that renders it.
  it("do not export React hooks", () => {
    const hookExports = listClientModules(appDirectory).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/^export (?:async )?(?:function|const) (use[A-Z]\w*)/gm)].map(
        (match) => `${path.slice(appDirectory.length + 1)}: ${match[1]}`,
      ),
    );
    expect(hookExports).toEqual([]);
  });
});
