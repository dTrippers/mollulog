import { describe, expect, it } from "@jest/globals";
import { normalizeSyncDraftEntryValue } from "./sync-draft";

describe("sync-draft", () => {
  it("normalizes item inventory quantities", () => {
    expect(normalizeSyncDraftEntryValue("item_inventory", "0")).toBe(0);
    expect(normalizeSyncDraftEntryValue("item_inventory", " 1200 ")).toBe(1200);
    expect(normalizeSyncDraftEntryValue("item_inventory", 42)).toBe(42);
  });

  it("rejects invalid item inventory quantities", () => {
    expect(() => normalizeSyncDraftEntryValue("item_inventory", "-1")).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("item_inventory", "1.5")).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("item_inventory", "")).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("item_inventory", Number.NaN)).toThrow(
      "아이템 수량은 0 이상의 정수만 입력해주세요",
    );
  });

  it("normalizes student tiers", () => {
    expect(normalizeSyncDraftEntryValue("student_tier", "1")).toBe(1);
    expect(normalizeSyncDraftEntryValue("student_tier", " 9 ")).toBe(9);
    expect(normalizeSyncDraftEntryValue("student_tier", 5)).toBe(5);
  });

  it("rejects invalid student tiers", () => {
    expect(() => normalizeSyncDraftEntryValue("student_tier", "0")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("student_tier", "10")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("student_tier", "1.5")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
    expect(() => normalizeSyncDraftEntryValue("student_tier", "")).toThrow(
      "학생 등급은 1부터 9까지의 정수만 입력해주세요",
    );
  });
});
