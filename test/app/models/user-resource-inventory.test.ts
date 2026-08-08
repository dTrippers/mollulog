import { describe, expect, it, jest } from "@jest/globals";
import {
  getUserResourceInventoryMapByItemUids,
  parseUserResourceInventoryQuantity,
  upsertUserResourceInventories,
  validateUserResourceInventoryQuantity,
} from "../../../app/models/user-resource-inventory";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

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

  it("loads large item UID lookups through PostgreSQL", async () => {
    const itemUids = Array.from({ length: 257 }, (_, index) => `item-${index}`);
    const rows = [0, 89, 90, 179, 180, 256].map((index) => ({
      id: index + 1,
      uid: `inventory-${index}`,
      userId: 7,
      itemUid: `item-${index}`,
      quantity: index * 10,
      createdAt: "2026-07-21 00:00:00",
      updatedAt: "2026-07-21 00:00:00",
    }));
    const db = new FakePostgresClient({ growth_resource_inventory: rows }, "growth_resource_inventory");

    const inventoryMap = await getUserResourceInventoryMapByItemUids(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      7,
      [...itemUids, "item-0"],
    );

    expect(inventoryMap).toEqual({
      "item-0": 0,
      "item-89": 890,
      "item-90": 900,
      "item-179": 1790,
      "item-180": 1800,
      "item-256": 2560,
    });
    expect(db.selectParameterCounts).toEqual([258]);
  });

  it("applies direct bulk inventory writes in one PostgreSQL transaction", async () => {
    const db = new FakePostgresClient({}, "growth_resource_inventory");
    await upsertUserResourceInventories(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      7,
      [
        { itemUid: "item-a", quantity: 10 },
        { itemUid: "item-b", quantity: 0 },
      ],
    );

    expect(db.statements[0]?.toLowerCase()).toBe("begin");
    expect(db.statements.at(-1)?.toLowerCase()).toBe("commit");
  });
});
