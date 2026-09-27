import { describe, expect, it } from "@jest/globals";
import { createUserLabeler, parsePlannerStatesCommand } from "../../scripts/planner-states/command";

describe("planner state operational commands", () => {
  it("parses backfill dry-run and parity commands", () => {
    expect(parsePlannerStatesCommand(["backfill", "--dry-run"])).toEqual({ command: "backfill", dryRun: true });
    expect(parsePlannerStatesCommand(["parity"])).toEqual({ command: "parity" });
    expect(parsePlannerStatesCommand([])).toEqual({ command: "help" });
    expect(() => parsePlannerStatesCommand(["parity", "--dry-run"])).toThrow("Usage:");
  });

  it("emits per-run pseudonymous labels instead of user ids", () => {
    const firstRun = createUserLabeler();
    const secondRun = createUserLabeler();
    const firstLabel = firstRun(731);

    expect(firstLabel).toMatch(/^user-[a-f0-9]{10}$/);
    expect(firstLabel).not.toContain("731");
    expect(secondRun(731)).not.toBe(firstLabel);
  });
});
