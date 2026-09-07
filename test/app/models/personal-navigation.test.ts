import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getPersonalNavigationState } from "~/models/personal-navigation";

describe("personal navigation query shape", () => {
  it("loads both personal red dots in one PostgreSQL query", async () => {
    const query = jest.fn(async () => ({
      rows: [{ has_unconsumed_coupons: true, has_unread_feedback_replies: true, unread_notification_count: "3" }],
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
      unreadNotificationCount: 3,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [statement, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(statement).toContain("nj.trigger <> 'connection-verification'");
    expect(values).toEqual([42]);
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
