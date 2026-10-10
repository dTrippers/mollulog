export type RowDraftSyncState = {
  isIdle: boolean;
  hasScheduledSave: boolean;
  hasUnhandledSubmission: boolean;
  hasRetryableDraft: boolean;
};

/** Whether a growth row may replace its draft with the latest server values. */
export function shouldSyncRowDraft({
  isIdle,
  hasScheduledSave,
  hasUnhandledSubmission,
  hasRetryableDraft,
}: RowDraftSyncState): boolean {
  // An in-flight or scheduled save owns the draft.
  if (!isIdle || hasScheduledSave) return false;
  // The result handler must see a finished response, success or failure, before the draft is replaced.
  if (hasUnhandledSubmission) return false;
  // A retryable failure keeps its input until the user retries it.
  return !hasRetryableDraft;
}
