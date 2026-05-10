import { describe, expect, it } from "@jest/globals";
import {
  parseUserResourceInventoryQuantity,
  validateUserResourceInventoryQuantity,
} from "../../../app/models/user-resource-inventory";

describe("user-resource-inventory", () => {
  it("parses non-negative integer quantities", () => {
    expect(parseUserResourceInventoryQuantity("0")).toBe(0);
    expect(parseUserResourceInventoryQuantity("1200")).toBe(1200);
    expect(parseUserResourceInventoryQuantity(42)).toBe(42);
  });

  it("rejects invalid quantities", () => {
    expect(() => parseUserResourceInventoryQuantity("-1")).toThrow("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    expect(() => parseUserResourceInventoryQuantity("1.5")).toThrow("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    expect(() => parseUserResourceInventoryQuantity("")).toThrow("보유 수량은 0 이상의 정수만 입력할 수 있어요");
    expect(() => validateUserResourceInventoryQuantity(Number.NaN)).toThrow(
      "보유 수량은 0 이상의 정수만 입력할 수 있어요",
    );
  });
});
