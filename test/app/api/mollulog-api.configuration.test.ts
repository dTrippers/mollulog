import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";

const wranglerConfig = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

describe("MolluLog API Worker routing configuration", () => {
  it("runs /v1 through the Worker while preserving SPA fallback for other asset requests", () => {
    const assets = wranglerConfig.match(/"assets"\s*:\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(assets).toMatch(/"run_worker_first"\s*:\s*\[\s*"\/v1"\s*,\s*"\/v1\/\*"\s*\]/);
    expect(assets).toMatch(/"not_found_handling"\s*:\s*"single-page-application"/);
  });

  it("routes the production API hostname using a custom domain", () => {
    const productionOffset = wranglerConfig.indexOf('"production": {');
    expect(productionOffset).toBeGreaterThanOrEqual(0);

    const productionConfig = wranglerConfig.slice(productionOffset);
    expect(productionConfig).toMatch(/"pattern"\s*:\s*"api\.mollulog\.net",\s*"custom_domain"\s*:\s*true/);
  });
});
