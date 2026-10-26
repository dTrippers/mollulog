import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const appDirectory = join(__dirname, "../../../app");

function listSharedModules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSharedModules(path);
    return /\.tsx?$/.test(entry.name) && !/\.server\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("modules outside `.server`", () => {
  // Client components import pure helpers from models, which pull in lib/cache. Vite stubs a Node builtin in the
  // browser and the stub throws on access, so one such import breaks hydration on every page in development.
  it("do not import Node builtins", () => {
    const builtinImports = listSharedModules(appDirectory).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/^import [^;]*? from "(node:[\w/]+)";/gm)].map(
        (match) => `${path.slice(appDirectory.length + 1)}: ${match[1]}`,
      ),
    );
    expect(builtinImports).toEqual([]);
  });
});
