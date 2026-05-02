import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_TIME_ZONE,
  formatInstant,
  isValidTimeZone,
  normalizeTimeZone,
  normalizeUtcTimestamp,
  parseUtcTimestamp,
} from "../../../app/lib/date-time";

describe("parseUtcTimestamp", () => {
  it("treats D1 current_timestamp values as UTC", () => {
    expect(parseUtcTimestamp("2026-05-01 15:30:00").toISOString()).toBe("2026-05-01T15:30:00.000Z");
  });

  it("keeps explicit UTC ISO timestamps on the same Seoul timeline", () => {
    expect(parseUtcTimestamp("2026-05-01T15:30:00.000Z").toISOString()).toBe("2026-05-01T15:30:00.000Z");
  });

  it("normalizes both timestamp shapes to the same ISO instant", () => {
    expect(normalizeUtcTimestamp("2026-05-01 15:30:00")).toBe("2026-05-01T15:30:00.000Z");
    expect(normalizeUtcTimestamp("2026-05-01T15:30:00.000Z")).toBe("2026-05-01T15:30:00.000Z");
  });

  it("formats the same instant in the requested timezone", () => {
    const instant = "2026-05-01T15:30:00.000Z";

    expect(formatInstant(instant, { timeZone: "UTC", format: "YYYY-MM-DD HH:mm" })).toBe("2026-05-01 15:30");
    expect(formatInstant(instant, { timeZone: "Asia/Seoul", format: "YYYY-MM-DD HH:mm" })).toBe("2026-05-02 00:30");
  });

  it("falls back to UTC for invalid timezones", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(normalizeTimeZone("Not/AZone")).toBe(DEFAULT_TIME_ZONE);
    expect(formatInstant("2026-05-01T15:30:00.000Z", { timeZone: "Not/AZone", format: "YYYY-MM-DD HH:mm" })).toBe(
      "2026-05-01 15:30",
    );
  });
});
