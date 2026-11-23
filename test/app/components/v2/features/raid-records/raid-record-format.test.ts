import { describe, expect, it } from "@jest/globals";
import { formatRaidSeasonPeriod } from "~/components/v2/features/raid-records/raid-record-format";

describe("formatRaidSeasonPeriod", () => {
  it("puts the year on the start, and on the end only when it differs", () => {
    expect(formatRaidSeasonPeriod("2023-08-29T02:00:00Z", "2023-09-05T19:00:00Z", "Asia/Seoul")).toBe(
      "2023/08/29 ~ 09/06",
    );
    expect(formatRaidSeasonPeriod("2023-12-26T02:00:00Z", "2024-01-02T10:00:00Z", "Asia/Seoul")).toBe(
      "2023/12/26 ~ 2024/01/02",
    );
    expect(formatRaidSeasonPeriod("2026-11-17T02:00:00Z", null, "Asia/Seoul")).toBe("2026/11/17");
  });

  it("decides the year in the display time zone", () => {
    expect(formatRaidSeasonPeriod("2025-12-25T02:00:00Z", "2025-12-31T16:00:00Z", "Asia/Seoul")).toBe(
      "2025/12/25 ~ 2026/01/01",
    );
    expect(formatRaidSeasonPeriod("2025-12-25T02:00:00Z", "2025-12-31T16:00:00Z", "UTC")).toBe("2025/12/25 ~ 12/31");
  });
});
