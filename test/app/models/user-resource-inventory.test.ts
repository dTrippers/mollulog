import { describe, expect, it } from "@jest/globals";
import {
  getUserResourceInventoryMapByItemUids,
  parseUserResourceInventoryQuantity,
  validateUserResourceInventoryQuantity,
} from "../../../app/models/user-resource-inventory";

type InventoryRow = {
  id: number;
  uid: string;
  userId: number;
  itemUid: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};

class InventoryStatement {
  params: unknown[] = [];

  constructor(
    readonly sql: string,
    private readonly rows: InventoryRow[],
  ) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async raw() {
    const [userId, ...itemUids] = this.params;
    return this.rows
      .filter((row) => row.userId === userId && itemUids.includes(row.itemUid))
      .map((row) => [row.id, row.uid, row.userId, row.itemUid, row.quantity, row.createdAt, row.updatedAt]);
  }
}

class InventoryD1Database {
  readonly statements: InventoryStatement[] = [];

  constructor(private readonly rows: InventoryRow[]) {}

  prepare(sql: string) {
    const statement = new InventoryStatement(sql, this.rows);
    this.statements.push(statement);
    return statement;
  }
}

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

  it("splits large item UID lookups to stay within D1's SQL variable limit", async () => {
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
    const db = new InventoryD1Database(rows);

    const inventoryMap = await getUserResourceInventoryMapByItemUids({ DB: db as unknown as D1Database } as Env, 7, [
      ...itemUids,
      "item-0",
    ]);

    expect(inventoryMap).toEqual({
      "item-0": 0,
      "item-89": 890,
      "item-90": 900,
      "item-179": 1790,
      "item-180": 1800,
      "item-256": 2560,
    });
    expect(db.statements).toHaveLength(3);
    expect(db.statements.every((statement) => statement.params.length <= 91)).toBe(true);
    expect(db.statements.flatMap((statement) => statement.params.slice(1))).toEqual(itemUids);
  });
});
