import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { GOOGLE_ANALYTICS_EVENT_NAMES } from "~/lib/google-analytics-events.client";

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.[cm]?tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

describe("Google Analytics event catalog", () => {
  it("has an application call site for every catalog event", () => {
    const appDirectory = join(process.cwd(), "app");
    const sources = listSourceFiles(appDirectory)
      .filter((path) => !path.endsWith("google-analytics-events.client.ts"))
      .map((path) => ({ path: relative(appDirectory, path), source: readFileSync(path, "utf8") }));
    const missing = GOOGLE_ANALYTICS_EVENT_NAMES.filter((eventName) => {
      if (eventName === "login" || eventName === "sign_up") {
        return !sources.some(({ path, source }) => path === "root.tsx" && source.includes("consumePendingAuthEvent"));
      }
      if (eventName === "recruitment_result_submitted") {
        return !sources.some(
          ({ path, source }) => path.startsWith("routes/") && source.includes("trackRecruitmentResultSubmitted("),
        );
      }
      const helperCallSites: Partial<Record<(typeof GOOGLE_ANALYTICS_EVENT_NAMES)[number], string>> = {
        ocr_job_applied: "trackOcrJobApplied(",
        event_shop_plan_saved: "trackEventShopPlanSaved(",
        community_post_liked: "trackLikeAdded(",
        timeline_liked: "trackLikeAdded(",
      };
      const helper = helperCallSites[eventName];
      if (helper) return !sources.some(({ source }) => source.includes(helper));
      return !sources.some(({ source }) => source.includes(`"${eventName}"`) || source.includes(`'${eventName}'`));
    });

    expect(missing).toEqual([]);
  });
});
