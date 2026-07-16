import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { hasUnregisteredActiveCoupons } from "~/models/coupon";

describe("coupon personal navigation state", () => {
  it("queries PostgreSQL for an active coupon without a user registration", async () => {
    const query = jest.fn(async () => ({ rows: [[3]], rowCount: 1 }));
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;

    await expect(
      hasUnregisteredActiveCoupons({ HYPERDRIVE: { connectionString: "postgres://unused" } } as Env, 7, {
        createClient: () => client,
      }),
    ).resolves.toBe(true);

    const [{ text }, values] = query.mock.calls[0] as unknown as [{ text: string }, unknown[]];
    expect(text).toContain('from "coupons"');
    expect(text).toContain('not exists (select "id" from "coupon_registrations"');
    expect(values).toContain(7);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
