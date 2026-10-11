import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { API_READ_LIMIT_PER_MINUTE, API_READ_WINDOW_SECONDS } from "~/domain/mollulog-api-spec";

const wranglerConfig = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

describe("MolluLog API Worker routing configuration", () => {
  it("runs API and llms document paths through the Worker while preserving SPA fallback for other assets", () => {
    const assets = wranglerConfig.match(/"assets"\s*:\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(assets).toMatch(
      /"run_worker_first"\s*:\s*\[\s*"\/v1"\s*,\s*"\/v1\/\*"\s*,\s*"\/llms\.txt"\s*,\s*"\/llms-full\.txt"\s*\]/,
    );
    expect(assets).toMatch(/"not_found_handling"\s*:\s*"single-page-application"/);
  });

  it("routes the production API hostname using a custom domain", () => {
    const productionOffset = wranglerConfig.indexOf('"production": {');
    expect(productionOffset).toBeGreaterThanOrEqual(0);

    const productionConfig = wranglerConfig.slice(productionOffset);
    expect(productionConfig).toMatch(/"pattern"\s*:\s*"api\.mollulog\.net",\s*"custom_domain"\s*:\s*true/);
    expect(productionConfig).toMatch(/"API_HOST"\s*:\s*"api\.mollulog\.net"/);
    expect(wranglerConfig.match(/"API_HOST"/g)).toHaveLength(1);
  });

  it("does not set API_HOST for staging", () => {
    const stagingOffset = wranglerConfig.indexOf('"staging": {');
    const productionOffset = wranglerConfig.indexOf('"production": {');
    expect(stagingOffset).toBeGreaterThanOrEqual(0);
    expect(productionOffset).toBeGreaterThan(stagingOffset);

    expect(wranglerConfig.slice(stagingOffset, productionOffset)).not.toContain('"API_HOST"');
  });

  it("keeps Cloudflare read limits aligned with the documentation constants", () => {
    const configuredReadLimits = [
      ...wranglerConfig.matchAll(
        /"name"\s*:\s*"API_READ_RATE_LIMITER"\s*,\s*"namespace_id"\s*:\s*"[^"]+"\s*,\s*"simple"\s*:\s*\{\s*"limit"\s*:\s*(\d+)\s*,\s*"period"\s*:\s*(\d+)\s*\}/g,
      ),
    ];

    expect(configuredReadLimits.length).toBeGreaterThan(0);
    for (const match of configuredReadLimits) {
      expect(Number(match[1])).toBe(API_READ_LIMIT_PER_MINUTE);
      expect(Number(match[2])).toBe(API_READ_WINDOW_SECONDS);
    }
  });
});
