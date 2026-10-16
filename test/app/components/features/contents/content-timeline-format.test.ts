import { describe, expect, it } from "@jest/globals";
import { formatOfflineEventSchedule } from "~/components/features/contents/content-timeline-format";
import { eventTypeLocale, timelineContentTypeLocale } from "~/locales/ko";

describe("offline-event timeline formatting", () => {
  it("formats a start-only schedule in the selected time zone", () => {
    expect(formatOfflineEventSchedule("2026-09-01T11:00:00.000Z", null, "Asia/Seoul")).toBe("9/1 20:00");
  });

  it("shows the end date only when the local dates differ", () => {
    expect(formatOfflineEventSchedule("2026-09-01T11:00:00.000Z", "2026-09-01T14:30:00.000Z", "Asia/Seoul")).toBe(
      "9/1 20:00–23:30",
    );
    expect(formatOfflineEventSchedule("2026-09-01T11:00:00.000Z", "2026-09-01T15:30:00.000Z", "Asia/Seoul")).toBe(
      "9/1 20:00–9/2 00:30",
    );
  });

  it("uses the integrated public label without changing the standalone live label", () => {
    expect(timelineContentTypeLocale.live).toBe("행사/방송");
    expect(timelineContentTypeLocale.offline_event).toBe("행사/방송");
    expect(eventTypeLocale.live).toBe("공식 방송");
  });
});
