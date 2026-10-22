import { describe, expect, it } from "@jest/globals";
import { toUtcIso } from "~/lib/date-time";
import { formatRaidRecordDateRange } from "~/routes/students.$id._components/StudentRaidRecordList";

describe("formatRaidRecordDateRange", () => {
  it("omits the repeated year when a record stays in one year", () => {
    expect(formatRaidRecordDateRange(toUtcIso("2027-01-05T00:00:00Z"), toUtcIso("2027-01-12T00:00:00Z"), "UTC")).toBe(
      "2027/01/05 ~ 01/12",
    );
  });

  it("keeps both years when a record crosses into another year", () => {
    expect(formatRaidRecordDateRange(toUtcIso("2026-12-28T00:00:00Z"), toUtcIso("2027-01-04T00:00:00Z"), "UTC")).toBe(
      "2026/12/28 ~ 2027/01/04",
    );
  });
});
