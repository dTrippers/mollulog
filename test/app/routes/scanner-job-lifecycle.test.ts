import { describe, expect, it } from "@jest/globals";
import { formatScannerRelativeTime } from "~/routes/scanner._components/scanner-messages";
import {
  getScannerPollDelay,
  removeScannerJobParam,
  type ScannerJobLike,
  shouldConfirmScannerReset,
} from "~/routes/scanner._components/useScannerJob";

type TestJob = ScannerJobLike & { application: { status: string } | null };

const reviewJob: TestJob = {
  uid: "job-1",
  status: "review_ready",
  updatedAt: "2026-08-22T00:00:00.000Z",
  application: { status: "pending" },
};

describe("shared scanner job lifecycle decisions", () => {
  it("uses bounded exponential polling backoff", () => {
    expect([0, 1, 2, 3].map(getScannerPollDelay)).toEqual([2000, 3000, 4500, 6750]);
    expect(getScannerPollDelay(20)).toBe(10_000);
    expect(getScannerPollDelay(-1)).toBe(2000);
  });

  it("confirms only when a review result is still unapplied", () => {
    expect(shouldConfirmScannerReset(null)).toBe(false);
    expect(shouldConfirmScannerReset({ ...reviewJob, status: "processing" })).toBe(false);
    expect(shouldConfirmScannerReset(reviewJob)).toBe(true);
    expect(shouldConfirmScannerReset({ ...reviewJob, application: { status: "applied" } })).toBe(false);
  });

  it("removes only the job query parameter when resetting", () => {
    expect(removeScannerJobParam(new URLSearchParams("job=job-1&tab=resource&filter=unread")).toString()).toBe(
      "tab=resource&filter=unread",
    );
  });

  it("formats current-job age deterministically", () => {
    const now = Date.parse("2026-08-22T00:00:00.000Z");
    expect(formatScannerRelativeTime("2026-08-21T23:59:30.000Z", now)).toBe("방금");
    expect(formatScannerRelativeTime("2026-08-21T23:15:00.000Z", now)).toBe("45분 전");
    expect(formatScannerRelativeTime("2026-08-20T00:00:00.000Z", now)).toBe("2일 전");
  });
});
