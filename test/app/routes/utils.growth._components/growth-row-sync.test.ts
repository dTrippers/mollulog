import { describe, expect, it } from "@jest/globals";
import { shouldSyncRowDraft } from "~/routes/utils.growth._components/growth-row-sync";

const settled = { isIdle: true, hasScheduledSave: false, hasUnhandledSubmission: false, hasRetryableDraft: false };

describe("growth row draft sync", () => {
  it("syncs a settled row with the server values", () => {
    expect(shouldSyncRowDraft(settled)).toBe(true);
  });

  it("keeps the draft while a save is scheduled or in flight", () => {
    expect(shouldSyncRowDraft({ ...settled, hasScheduledSave: true })).toBe(false);
    expect(shouldSyncRowDraft({ ...settled, isIdle: false, hasUnhandledSubmission: true })).toBe(false);
  });

  it("leaves a finished response to the result handler before replacing the draft", () => {
    expect(shouldSyncRowDraft({ ...settled, hasUnhandledSubmission: true })).toBe(false);
  });

  it("keeps a retryable failure's input until it is retried", () => {
    expect(shouldSyncRowDraft({ ...settled, hasRetryableDraft: true })).toBe(false);
  });
});
