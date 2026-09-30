import { describe, expect, it } from "@jest/globals";
import { formatApChargeExceptionPeriod } from "~/components/features/futures/PyroxenePlannerSourcePanel";

describe("AP charge exception period label", () => {
  it("uses the integrated planner's date-time range format for game reset dates", () => {
    expect(formatApChargeExceptionPeriod("2026-09-30", "2026-10-02")).toBe("9/30 04:00 ~ 10/3 04:00");
  });

  it("shows the day after an inclusive exception end date at the next reset", () => {
    expect(formatApChargeExceptionPeriod("2026-11-16", "2026-11-17")).toBe("11/16 04:00 ~ 11/18 04:00");
  });
});
