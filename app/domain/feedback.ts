export const FEEDBACK_ADDITIONAL_MAX_BYTES = 256 * 1024;

export type EventShopBugReportAdditional = {
  type: "event_shop_bug_report";
  version: 1;
  payload: Record<string, unknown> & {
    timestamp: string;
    eventUid: string;
  };
};

export type FeedbackAdditional = EventShopBugReportAdditional;

export function parseFeedbackAdditional(value: string | null): FeedbackAdditional | null {
  if (!value) {
    return null;
  }

  if (new TextEncoder().encode(value).byteLength > FEEDBACK_ADDITIONAL_MAX_BYTES) {
    throw new Error("Feedback additional payload is too large");
  }

  const parsed = JSON.parse(value) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !("type" in parsed) ||
    parsed.type !== "event_shop_bug_report" ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("payload" in parsed) ||
    typeof parsed.payload !== "object" ||
    parsed.payload === null ||
    Array.isArray(parsed.payload) ||
    !("timestamp" in parsed.payload) ||
    typeof parsed.payload.timestamp !== "string" ||
    !("eventUid" in parsed.payload) ||
    typeof parsed.payload.eventUid !== "string"
  ) {
    throw new Error("Feedback additional payload is invalid");
  }

  return parsed as FeedbackAdditional;
}
