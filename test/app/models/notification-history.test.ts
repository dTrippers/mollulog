import { describe, expect, it, jest } from "@jest/globals";
import { getNotificationHistory, markNotificationHistoryRead } from "~/models/notification-history.server";

jest.mock("~/lib/postgres.server", () => ({
  createPostgresClient: jest.fn(),
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

function envWithClient(client: unknown): Env {
  return { __pgClient: client } as unknown as Env;
}

describe("notification history model", () => {
  it("loads only delivered sent jobs for one account and maps the snapshot watermark", async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          uid: "job-1",
          trigger: "event-start",
          payload: {
            message: "이벤트가 시작됩니다.",
            action: { label: "이벤트 페이지 바로가기", url: "https://mollulog.net/events/event-1" },
          },
          delivered_at: new Date("2026-09-07T11:00:00.000Z"),
          delivered_at_text: "2026-09-07 11:00:00.123456+00",
          is_unread: true,
        },
        {
          uid: "job-2",
          trigger: "event-end",
          payload: { message: "연결이 확인되었습니다." },
          delivered_at: new Date("2026-09-07T10:00:00.000Z"),
          delivered_at_text: "2026-09-07 10:00:00.654321+00",
          is_unread: false,
        },
      ],
      rowCount: 2,
    }));
    const client = { query };

    await expect(
      getNotificationHistory(envWithClient(client), 42, {
        now: () => new Date("2026-09-07T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      notifications: [
        expect.objectContaining({ typeLabel: "이벤트 시작", isUnread: true }),
        expect.objectContaining({ typeLabel: "이벤트 종료", isUnread: false }),
      ],
      snapshotMaxDeliveredAt: "2026-09-07 11:00:00.123456+00",
    });

    const [statement, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(statement).toContain("j.user_id = $1");
    expect(statement).toContain("j.uid");
    expect(statement).toContain("j.delivered_at::text as delivered_at_text");
    expect(statement).toContain("as is_unread");
    expect(statement).toContain("j.status = 'sent'");
    expect(statement).toContain("j.delivered_at is not null");
    expect(statement).toContain("j.trigger <> 'connection-verification'");
    expect(statement).toContain("order by j.delivered_at desc, j.id desc");
    expect(statement).toContain("limit 20");
    expect(values).toEqual([42]);
  });

  it("ignores an invalid delivered timestamp without exposing malformed storage", async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [
          {
            uid: "job-invalid-delivered-at",
            trigger: "event-start",
            payload: { message: "유효한 알림" },
            delivered_at: "not-a-date",
            delivered_at_text: "not-a-date",
            is_unread: true,
          },
        ],
        rowCount: 1,
      })),
    };

    await expect(getNotificationHistory(envWithClient(client), 42)).resolves.toEqual({
      notifications: [],
      snapshotMaxDeliveredAt: null,
    });
  });

  it("uses each valid job uid as the stable identity for same-time same-trigger rows", async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [
          {
            uid: "job-1",
            trigger: "event-start",
            payload: { message: "첫 번째 이벤트" },
            delivered_at: new Date("2026-09-07T11:00:00.000Z"),
            delivered_at_text: "2026-09-07 11:00:00.000000+00",
            is_unread: false,
          },
          {
            uid: "job-2",
            trigger: "event-start",
            payload: { message: "두 번째 이벤트" },
            delivered_at: new Date("2026-09-07T11:00:00.000Z"),
            delivered_at_text: "2026-09-07 11:00:00.000000+00",
            is_unread: true,
          },
        ],
        rowCount: 2,
      })),
    };

    const result = await getNotificationHistory(envWithClient(client), 42);
    const uids = result.notifications.map(({ uid }) => uid);

    expect(uids).toEqual(["job-1", "job-2"]);
    expect(new Set(uids).size).toBe(2);
  });

  it("preserves PostgreSQL microsecond precision and uses the SQL unread result", async () => {
    const snapshotTimestamp = "2026-09-07 14:53:00.758831+00";
    const microsecondLaterTimestamp = "2026-09-07 14:53:00.758832+00";
    const client = {
      query: jest.fn(async () => ({
        rows: [
          {
            uid: "job-microsecond-later",
            trigger: "event-start",
            payload: { message: "더 늦게 도착한 알림" },
            delivered_at: new Date("2026-09-07T14:53:00.758Z"),
            delivered_at_text: microsecondLaterTimestamp,
            is_unread: true,
          },
          {
            uid: "job-snapshot",
            trigger: "event-start",
            payload: { message: "스냅샷 알림" },
            delivered_at: new Date("2026-09-07T14:53:00.758Z"),
            delivered_at_text: snapshotTimestamp,
            is_unread: false,
          },
        ],
        rowCount: 2,
      })),
    };

    const result = await getNotificationHistory(envWithClient(client), 42);

    expect(result.snapshotMaxDeliveredAt).toBe(microsecondLaterTimestamp);
    expect(result.notifications.map(({ uid, isUnread }) => ({ uid, isUnread }))).toEqual([
      { uid: "job-microsecond-later", isUnread: true },
      { uid: "job-snapshot", isUnread: false },
    ]);
  });

  it("passes the exact snapshot watermark so a microsecond-later delivery stays unread", async () => {
    const snapshotTimestamp = "2026-09-07 14:53:00.758831+00";
    const microsecondLaterTimestamp = "2026-09-07 14:53:00.758832+00";
    const statements: string[] = [];
    const values: unknown[][] = [];
    const client = {
      query: jest.fn(async (statement: string, queryValues: unknown[] = []) => {
        statements.push(statement.replace(/\s+/g, " ").trim());
        values.push(queryValues);
        if (statement.includes("count(*)::text")) {
          return { rows: [{ unread_count: "1" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await expect(
      markNotificationHistoryRead(envWithClient(client), 42, snapshotTimestamp, {
        now: () => new Date("2026-09-07T15:00:00.000Z"),
      }),
    ).resolves.toEqual({ unreadCount: 1 });

    const insertStatement = statements.find((statement) =>
      statement.startsWith("insert into notification_read_states"),
    );
    expect(insertStatement).toBeDefined();
    expect(insertStatement).toContain("j.delivered_at <= $2");
    expect(values).toContainEqual([42, snapshotTimestamp, new Date("2026-09-07T15:00:00.000Z")]);
    expect(microsecondLaterTimestamp).not.toBe(snapshotTimestamp);
    expect(new Date(microsecondLaterTimestamp).getTime()).toBe(new Date(snapshotTimestamp).getTime());
  });

  it("skips a delivered row whose job uid is missing or malformed", async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [
          {
            uid: null,
            trigger: "event-start",
            payload: { message: "내부 ID를 노출하지 않음" },
            delivered_at: new Date("2026-09-07T11:00:00.000Z"),
            delivered_at_text: "2026-09-07 11:00:00.000000+00",
            is_unread: true,
          },
        ],
        rowCount: 1,
      })),
    };

    await expect(getNotificationHistory(envWithClient(client), 42)).resolves.toEqual({
      notifications: [],
      snapshotMaxDeliveredAt: null,
    });
  });

  it("marks only the requested snapshot and returns the remaining unread count", async () => {
    const statements: string[] = [];
    const values: unknown[][] = [];
    const client = {
      query: jest.fn(async (statement: string, queryValues: unknown[] = []) => {
        statements.push(statement.replace(/\s+/g, " ").trim());
        values.push(queryValues);
        if (statement.includes("count(*)::text")) {
          return { rows: [{ unread_count: "2" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await expect(
      markNotificationHistoryRead(envWithClient(client), 42, "2026-09-07 11:00:00.758831+00", {
        now: () => new Date("2026-09-07T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ unreadCount: 2 });

    expect(statements).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(statements.some((statement) => statement.startsWith("insert into notification_read_states"))).toBe(true);
    expect(statements.some((statement) => statement.includes("j.delivered_at <= $2"))).toBe(true);
    expect(
      statements
        .find((statement) => statement.startsWith("insert into notification_read_states"))
        ?.includes("j.trigger <> 'connection-verification'"),
    ).toBe(true);
    expect(
      statements
        .find((statement) => statement.startsWith("select count(*)::text as unread_count"))
        ?.includes("j.trigger <> 'connection-verification'"),
    ).toBe(true);
    expect(values).toContainEqual([42, "2026-09-07 11:00:00.758831+00", new Date("2026-09-07T12:00:00.000Z")]);
  });

  it("rejects an invalid watermark before opening a database operation", async () => {
    const query = jest.fn();
    await expect(markNotificationHistoryRead(envWithClient({ query }), 42, "not-a-date")).rejects.toThrow(
      "Invalid notification read watermark",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
