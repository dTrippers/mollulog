import { describe, expect, it } from "@jest/globals";
import { FEEDBACK_ADDITIONAL_MAX_BYTES, parseFeedbackAdditional } from "~/domain/feedback";

describe("parseFeedbackAdditional", () => {
  it("accepts the versioned event shop diagnostic envelope", () => {
    const value = {
      type: "event_shop_bug_report",
      version: 1,
      payload: {
        timestamp: "2026-07-16T00:00:00.000Z",
        eventUid: "event-1",
        state: { target: 0 },
      },
    };

    expect(parseFeedbackAdditional(JSON.stringify(value))).toEqual(value);
  });

  it("accepts the versioned walkthrough timeline feedback envelope", () => {
    const value = {
      type: "walkthrough_timeline_feedback",
      version: 1,
      payload: {
        timestamp: "2026-07-18T00:00:00.000Z",
        path: "/timelines/timeline-1/edit",
        viewport: { width: 390, height: 844 },
      },
    };

    expect(parseFeedbackAdditional(JSON.stringify(value))).toEqual(value);
  });

  it("rejects unknown envelopes and oversized diagnostics", () => {
    expect(() => parseFeedbackAdditional('{"type":"unknown","version":1,"payload":{}}')).toThrow(
      "Feedback additional payload is invalid",
    );
    expect(() => parseFeedbackAdditional("x".repeat(FEEDBACK_ADDITIONAL_MAX_BYTES + 1))).toThrow(
      "Feedback additional payload is too large",
    );
  });
});
