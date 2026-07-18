export const FEEDBACK_ADDITIONAL_MAX_BYTES = 256 * 1024;

export type EventShopBugReportAdditional = {
  type: "event_shop_bug_report";
  version: 1;
  payload: Record<string, unknown> & {
    timestamp: string;
    eventUid: string;
  };
};

export type WalkthroughTimelineFeedbackAdditional = {
  type: "walkthrough_timeline_feedback";
  version: 1;
  payload: Record<string, unknown> & {
    timestamp: string;
    path: string;
  };
};

export type FeedbackAdditional = EventShopBugReportAdditional | WalkthroughTimelineFeedbackAdditional;

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
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("payload" in parsed) ||
    typeof parsed.payload !== "object" ||
    parsed.payload === null ||
    Array.isArray(parsed.payload) ||
    !("timestamp" in parsed.payload) ||
    typeof parsed.payload.timestamp !== "string"
  ) {
    throw new Error("Feedback additional payload is invalid");
  }

  if (
    parsed.type === "event_shop_bug_report" &&
    "eventUid" in parsed.payload &&
    typeof parsed.payload.eventUid === "string"
  ) {
    return parsed as FeedbackAdditional;
  }

  if (
    parsed.type === "walkthrough_timeline_feedback" &&
    "path" in parsed.payload &&
    typeof parsed.payload.path === "string"
  ) {
    return parsed as FeedbackAdditional;
  }

  throw new Error("Feedback additional payload is invalid");
}
