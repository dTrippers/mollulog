import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { registerPostgresCoupon } from "~/db/postgres/coupons";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };

describe("PostgreSQL coupon writes", () => {
  it("keeps repeated registrations idempotent with the user and coupon conflict target", async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;

    await registerPostgresCoupon(env, 10, 20, { createClient: () => client });

    const [{ text }, values] = query.mock.calls[0] as unknown as [{ text: string }, unknown[]];
    expect(text).toContain('insert into "coupon_registrations"');
    expect(text).toContain('on conflict ("user_id","coupon_id") do nothing');
    expect(values).toEqual(expect.arrayContaining([10, 20]));
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
