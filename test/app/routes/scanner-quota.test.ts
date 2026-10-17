import { describe, expect, it } from "@jest/globals";
import { getScannerQuotaDisplayState, getScannerQuotaLowThreshold } from "~/routes/scanner._components/useScannerQuota";

const quota = (remaining: number, limit = 200, nextAvailableAt: string | null = null) => ({
  limit,
  used: limit - remaining,
  remaining,
  nextAvailableAt,
});

describe("scanner quota display", () => {
  it("shows video quota on every tab, so the item tab has no video-hiding rule", () => {
    expect(getScannerQuotaDisplayState(quota(1, 10), false)).toEqual({ kind: "low", quota: quota(1, 10) });
    expect(getScannerQuotaDisplayState(quota(3, 10), false)).toEqual({ kind: "normal", quota: quota(3, 10) });
  });

  it("keeps loading and failure apart from an empty quota", () => {
    expect(getScannerQuotaDisplayState(null, false)).toEqual({ kind: "loading" });
    expect(getScannerQuotaDisplayState(null, true)).toEqual({ kind: "error" });
    // A failed re-read wins over the older quota, so a stale exhausted quota never blocks uploads without a retry.
    expect(getScannerQuotaDisplayState(quota(0, 10), true)).toEqual({ kind: "error" });
  });

  it("marks a low amount at one sixth of the limit, with a minimum of one", () => {
    expect(getScannerQuotaLowThreshold(200)).toBe(33);
    expect(getScannerQuotaLowThreshold(10)).toBe(1);
    expect(getScannerQuotaDisplayState(quota(33), false).kind).toBe("low");
    expect(getScannerQuotaDisplayState(quota(34), false).kind).toBe("normal");
  });

  it("reports an exhausted quota with its next available time", () => {
    const next = "2026-10-24T05:30:00.000Z";
    expect(getScannerQuotaDisplayState(quota(0, 200, next), false)).toEqual({
      kind: "exhausted",
      quota: quota(0, 200, next),
    });
  });
});
