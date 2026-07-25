import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const ROUTES_DIRECTORY = join(process.cwd(), "app", "routes");
const MODELS_DIRECTORY = join(process.cwd(), "app", "models");

describe("profile route privacy guard", () => {
  it("keeps every public @username data route behind getRouteSensei as a coarse architecture backstop", () => {
    const unguardedRoutes = readdirSync(ROUTES_DIRECTORY)
      .filter((file) => file.startsWith("$username") && file.endsWith(".tsx"))
      .filter((file) => !file.includes(".edit."))
      .filter((file) => {
        const source = readFileSync(join(ROUTES_DIRECTORY, file), "utf8");
        const hasDataHandler = /export const (?:loader|action)\s*=/.test(source);
        return hasDataHandler && !source.includes("getRouteSensei");
      });

    expect(unguardedRoutes).toEqual([]);
  });

  it("uses the shared profile policy in model files that expose sensei identity as a coarse architecture backstop", () => {
    const unguardedModels = readdirSync(MODELS_DIRECTORY)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => {
        const source = readFileSync(join(MODELS_DIRECTORY, file), "utf8");
        return source.includes("username: senseisTable.username") && !source.includes("senseiProfileVisibilityFilter");
      });

    expect(unguardedModels).toEqual([]);
  });

  it("guards public Postgres timeline routes with D1 profile visibility", () => {
    const unguardedRoutes = readdirSync(ROUTES_DIRECTORY)
      .filter((file) => file.endsWith(".tsx") && !file.includes(".edit."))
      .filter((file) => {
        const source = readFileSync(join(ROUTES_DIRECTORY, file), "utf8");
        const readsTimeline = /(?:get|list)Postgres\w*WalkthroughTimeline/.test(source);
        const checksProfile =
          source.includes("getRouteSensei") ||
          source.includes("isSenseiProfileVisibleTo") ||
          source.includes("getVisibleSenseisById");
        return readsTimeline && !checksProfile;
      });

    expect(unguardedRoutes).toEqual([]);
  });
});
