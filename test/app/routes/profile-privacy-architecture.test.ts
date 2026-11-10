import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

const ROUTES_DIRECTORY = join(process.cwd(), "app", "routes");
const MODELS_DIRECTORY = join(process.cwd(), "app", "models");

describe("profile route privacy guard", () => {
  it("keeps PostgreSQL profile lookup out of the client-visible layout module", () => {
    const layoutSource = readFileSync(join(ROUTES_DIRECTORY, "$username.tsx"), "utf8");
    const serverSource = readFileSync(
      join(ROUTES_DIRECTORY, "$username._components", "route-sensei.server.ts"),
      "utf8",
    );
    // The layout loader may call the guard, but only through the server-only module, so the lookup never reaches the
    // client bundle.
    expect(layoutSource).not.toContain("~/models/sensei");
    expect(layoutSource).not.toMatch(/function getRouteSensei/);
    expect(layoutSource).toContain('import { getRouteSensei } from "./$username._components/route-sensei.server";');
    expect(serverSource).toContain("getSenseiByUsername");
  });

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

  it("guards public Postgres timeline routes with shared profile visibility", () => {
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
