import { describe, expect, it } from "@jest/globals";
import type { Metric } from "web-vitals";
import { createWebVitalsReporter } from "~/lib/web-vitals.client";

describe("web vitals reporter", () => {
  it("reports LCP, INP, and CLS once each and ignores other metrics", () => {
    const reports: Metric[] = [];
    const reporter = createWebVitalsReporter((value) => reports.push(value));
    const metric = (name: string, value: number) => ({ name, value, rating: "good" }) as Metric;

    reporter(metric("LCP", 1200));
    reporter(metric("LCP", 1300));
    reporter(metric("INP", 180));
    reporter(metric("CLS", 0.01));
    reporter(metric("FCP", 500));

    expect(reports.map((value) => [value.name, value.value])).toEqual([
      ["LCP", 1200],
      ["INP", 180],
      ["CLS", 0.01],
    ]);
  });
});
