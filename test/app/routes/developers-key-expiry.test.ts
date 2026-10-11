import { describe, expect, it } from "@jest/globals";
import { formatKeyExpiryRemaining } from "~/routes/developers._components/api-key-expiry";

const now = Date.parse("2026-10-11T00:00:00Z");
const hour = 60 * 60 * 1000;

describe("API key expiry remaining time", () => {
  it.each<[number, string]>([
    [-1, "만료됨"],
    [0, "만료됨"],
    [1, "1시간 미만 남음"],
    [hour - 1, "1시간 미만 남음"],
    [hour, "1시간 남음"],
    [2 * hour, "2시간 남음"],
    [23 * hour + 1, "24시간 남음"],
    [24 * hour, "24시간 남음"],
    [24 * hour + 1, "2일 남음"],
    [48 * hour, "2일 남음"],
  ])("formats a remaining duration of %i milliseconds as %s", (remaining, expected) => {
    expect(formatKeyExpiryRemaining(new Date(now + remaining).toISOString(), now)).toBe(expected);
  });
});
