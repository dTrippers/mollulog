import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { getLatestAdminFeedbackReplyId, markFeedbackTicketAdminRepliesSeen } from "~/models/feedback";

function createClient(rows: unknown[][] = []) {
  const query = jest.fn(async () => ({ rows, rowCount: rows.length }));
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, query };
}

describe("feedback personal navigation state", () => {
  it("finds the latest admin reply id without counting user replies", () => {
    expect(
      getLatestAdminFeedbackReplyId([
        { id: 10, uid: "reply-user", ticketId: 1, userId: 1, isAdmin: false, content: "user", createdAt: "" },
        { id: 11, uid: "reply-admin-a", ticketId: 1, userId: 2, isAdmin: true, content: "admin", createdAt: "" },
        { id: 12, uid: "reply-user-b", ticketId: 1, userId: 1, isAdmin: false, content: "user", createdAt: "" },
      ]),
    ).toBe(11);
  });

  it("skips PostgreSQL when the latest admin reply is already seen", async () => {
    const { client, query } = createClient();

    await markFeedbackTicketAdminRepliesSeen(
      { HYPERDRIVE: { connectionString: "postgres://unused" } } as Env,
      { id: 10, userId: 1, lastSeenAdminReplyId: 105 },
      105,
      { createClient: () => client },
    );

    expect(query).not.toHaveBeenCalled();
    expect(client.connect).not.toHaveBeenCalled();
  });
});
