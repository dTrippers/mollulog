import { describe, expect, it } from "@jest/globals";
import {
  applyScannerJobStatusUpdate,
  mergeScannerJobsPreservingSelected,
  mergeScannerJobsWithStatusUpdates,
  type ScannerJobSummary,
} from "~/routes/scanner._components/ScannerJobsPanel";

const job = (uid: string, status: string, updatedAt = "2026-08-22T00:00:00.000Z"): ScannerJobSummary => ({
  uid,
  jobKind: "item_inventory_images_v1",
  status,
  progress: { completed: 0, failed: 0, total: 1 },
  application: null,
  createdAt: updatedAt,
  updatedAt,
  expiresAt: "2026-08-23T00:00:00.000Z",
});

describe("scanner jobs panel synchronization", () => {
  it("applies a local selected-job status transition without a GET result", () => {
    const current = [job("selected", "queued"), job("other", "processing")];

    const next = applyScannerJobStatusUpdate(current, {
      uid: "selected",
      status: "finalizing",
      updatedAt: "2026-08-22T00:00:01.000Z",
    });

    expect(next.map(({ uid, status }) => ({ uid, status }))).toEqual([
      { uid: "selected", status: "finalizing" },
      { uid: "other", status: "processing" },
    ]);
  });

  it("preserves a newer selected status while refreshing other jobs", () => {
    const current = [job("selected", "processing", "2026-08-22T00:00:02.000Z"), job("other", "queued")];
    const response = [
      job("selected", "queued", "2026-08-22T00:00:01.000Z"),
      job("other", "finalizing"),
      job("new", "processing"),
    ];

    const next = mergeScannerJobsPreservingSelected(current, response, "selected");

    expect(next.map(({ uid, status }) => ({ uid, status }))).toEqual([
      { uid: "selected", status: "processing" },
      { uid: "other", status: "finalizing" },
      { uid: "new", status: "processing" },
    ]);
  });

  it("evicts a selected job omitted by the authoritative server list", () => {
    const current = [job("selected", "processing"), job("other", "queued")];
    const response = [job("other", "finalizing")];

    expect(mergeScannerJobsPreservingSelected(current, response, "selected")).toEqual(response);
  });

  it("keeps a newer detail transition when an older list response arrives later", () => {
    const list = [job("selected", "queued", "2026-08-22T00:00:01.000Z")];
    const detail = {
      uid: "selected",
      status: "processing",
      updatedAt: "2026-08-22T00:00:02.000Z",
    };

    const next = mergeScannerJobsWithStatusUpdates(list, new Map([[detail.uid, detail]]));

    expect(next[0]).toMatchObject({ status: "processing", updatedAt: detail.updatedAt });
  });

  it("keeps a newer list response when a stale detail transition arrives later", () => {
    const list = [job("selected", "processing", "2026-08-22T00:00:02.000Z")];
    const staleDetail = {
      uid: "selected",
      status: "queued",
      updatedAt: "2026-08-22T00:00:01.000Z",
    };

    const next = applyScannerJobStatusUpdate(list, staleDetail);

    expect(next[0]).toMatchObject({ status: "processing", updatedAt: list[0].updatedAt });
  });
});
