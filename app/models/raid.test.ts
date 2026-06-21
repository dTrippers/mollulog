import { describe, expect, it, jest } from "@jest/globals";
import { ALL_TOTAL_ASSUALT_BOSS, normalizeBossUid, timeToScore } from "./raid";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

describe("raid score data", () => {
  it("uses BAQL raid boss uids", () => {
    expect(ALL_TOTAL_ASSUALT_BOSS).toContain("perorodzilla");
    expect(ALL_TOTAL_ASSUALT_BOSS).toContain("kaiten");
    expect(ALL_TOTAL_ASSUALT_BOSS).toContain("kurokage");
    expect(ALL_TOTAL_ASSUALT_BOSS).not.toContain("perorozilla");
    expect(ALL_TOTAL_ASSUALT_BOSS).not.toContain("kaiten-fx-mk0");
    expect(ALL_TOTAL_ASSUALT_BOSS).not.toContain("myouki-kurokage");
  });

  it("normalizes legacy raid score boss uids", () => {
    expect(normalizeBossUid("perorozilla")).toBe("perorodzilla");
    expect(normalizeBossUid("kaiten-fx-mk0")).toBe("kaiten");
    expect(normalizeBossUid("myouki-kurokage")).toBe("kurokage");
    expect(normalizeBossUid("binah")).toBe("binah");
    expect(normalizeBossUid("unknown")).toBeNull();
  });

  it("includes drumbarka as a 270-second boss", () => {
    expect(ALL_TOTAL_ASSUALT_BOSS).toContain("drumbarka");
    expect(timeToScore("drumbarka", "normal", 3600000)).toBe(554700);
  });

  it("supports the 180-second lunatic floor score", () => {
    expect(timeToScore("binah", "lunatic", 3600000)).toBe(43235000);
  });
});
