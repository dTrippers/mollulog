import { describe, expect, it, jest } from "@jest/globals";
import { ALL_TOTAL_ASSUALT_BOSS, timeToScore } from "./raid";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

describe("raid score data", () => {
  it("includes drumbarka as a 270-second boss", () => {
    expect(ALL_TOTAL_ASSUALT_BOSS).toContain("drumbarka");
    expect(timeToScore("drumbarka", "normal", 3600000)).toBe(554700);
  });

  it("supports the 180-second lunatic floor score", () => {
    expect(timeToScore("binah", "lunatic", 3600000)).toBe(43235000);
  });
});
