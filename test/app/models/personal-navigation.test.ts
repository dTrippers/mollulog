import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPersonalNavigationState } from "~/models/personal-navigation";

describe("personal navigation query shape", () => {
  it("loads both personal red dots in one PostgreSQL query", async () => {
    const query = jest.fn(async () => ({
      rows: [{ has_unconsumed_coupons: true, has_unread_feedback_replies: true }],
      rowCount: 1,
    }));
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;

    await expect(
      getPersonalNavigationState({ HYPERDRIVE: { connectionString: "postgres://unused" } } as Env, 42, {
        createClient: () => client,
      }),
    ).resolves.toEqual({
      hasUnconsumedCoupons: true,
      hasUnreadFeedbackReplies: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1]).toEqual([42]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
