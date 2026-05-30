import { describe, expect, it } from "@jest/globals";
import {
  calculateShopPurchaseDays,
  getShopResourcePurchaseDaysLimit,
} from "../../../../../../../app/components/features/events/shop/calculations/purchase-days";

describe("calculateShopPurchaseDays", () => {
  it("counts reset times inside the event period", () => {
    expect(calculateShopPurchaseDays("2026-01-01T11:00:00+09:00", "2026-01-15T11:00:00+09:00")).toBe(14);
  });

  it("includes the same-day reset when the event starts before reset time", () => {
    expect(calculateShopPurchaseDays("2026-01-01T02:00:00+09:00", "2026-01-01T11:00:00+09:00")).toBe(1);
  });

  it("returns zero when the period has no reset time", () => {
    expect(calculateShopPurchaseDays("2026-01-01T11:00:00+09:00", "2026-01-02T03:59:00+09:00")).toBe(0);
  });

  it("uses steel-continent ticket-specific purchase day limits", () => {
    expect(getShopResourcePurchaseDaysLimit("steel-continent", "8540000", 14)).toBe(14);
    expect(getShopResourcePurchaseDaysLimit("steel-continent", "8540001", 14)).toBe(14);
    expect(getShopResourcePurchaseDaysLimit("steel-continent", "8540002", 14)).toBe(7);
  });

  it("falls back to event purchase days when there is no resource-specific limit", () => {
    expect(getShopResourcePurchaseDaysLimit("steel-continent", "8540100", 14)).toBe(14);
    expect(getShopResourcePurchaseDaysLimit("other-event", "8540000", 14)).toBe(14);
  });
});
