import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPostgresActiveSiteBanner } from "~/db/postgres/site-banners";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };

describe("PostgreSQL site banners", () => {
  it("queries the half-open active range with deterministic overlap ordering", async () => {
    type QueryConfig = { text?: string };
    const query = jest.fn<(...args: [QueryConfig]) => Promise<{ rows: []; rowCount: number }>>(async () => ({
      rows: [],
      rowCount: 0,
    }));
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;

    const result = await getPostgresActiveSiteBanner(env, "2026-08-01T00:30:00.000Z", {
      createClient: () => client,
    });

    expect(result).toBeNull();
    const queryConfig = query.mock.calls.find(([value]) => typeof value === "object" && value !== null)?.[0];
    expect(queryConfig).toBeDefined();
    if (!queryConfig) throw new Error("Expected a PostgreSQL query call");
    expect(queryConfig.text).toContain('"starts_at" <= $1');
    expect(queryConfig.text).toContain('"ends_at" > $2');
    expect(queryConfig.text).toContain('order by "site_banners"."ends_at" asc, "site_banners"."uid" asc');
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
