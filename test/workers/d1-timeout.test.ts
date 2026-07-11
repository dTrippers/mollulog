import { describe, expect, it, jest } from "@jest/globals";
import { D1TimeoutError, withD1Timeout } from "../../workers/d1-timeout";

type FakeStatement = D1PreparedStatement & { query: string };

function createStatement(query: string, result: Promise<unknown> = Promise.resolve({ success: true })) {
  const statement = {
    query,
    bind: jest.fn(() => statement),
    first: jest.fn(() => result),
    run: jest.fn(() => result),
    all: jest.fn(() => result),
    raw: jest.fn(() => result),
  } as unknown as FakeStatement;
  return statement;
}

describe("withD1Timeout sessions", () => {
  it("forwards the session constraint and preserves session methods", () => {
    const session = {
      prepare: jest.fn((query: string) => createStatement(query)),
      batch: jest.fn(async () => []),
      getBookmark: jest.fn(() => "bookmark-1"),
    } as unknown as D1DatabaseSession;
    const db = {
      withSession: jest.fn(() => session),
    } as unknown as D1Database;

    const wrappedSession = withD1Timeout(db).withSession("first-unconstrained");

    expect(db.withSession).toHaveBeenCalledWith("first-unconstrained");
    expect(wrappedSession.getBookmark()).toBe("bookmark-1");
  });

  it("applies the D1 deadline to session statements", async () => {
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const statement = createStatement("select 1", new Promise(() => undefined));
    const session = {
      prepare: jest.fn(() => statement),
      batch: jest.fn(async () => []),
      getBookmark: jest.fn(() => null),
    } as unknown as D1DatabaseSession;
    const db = {
      withSession: jest.fn(() => session),
    } as unknown as D1Database;
    const query = withD1Timeout(db, 100).withSession("first-unconstrained").prepare("select 1").all();
    query.catch(() => undefined);

    await jest.advanceTimersByTimeAsync(100);

    await expect(query).rejects.toBeInstanceOf(D1TimeoutError);
    expect(console.error).toHaveBeenCalledWith(
      "[io-watchdog] timeout",
      expect.objectContaining({ label: "d1", operation: "statement.all", timeoutMs: 100 }),
    );
  });

  it("unwraps proxied statements before a session batch", async () => {
    const first = createStatement("select 1");
    const second = createStatement("select 2");
    const batch = jest.fn(async (_statements: D1PreparedStatement[]) => []);
    const session = {
      prepare: jest.fn((query: string) => (query === "select 1" ? first : second)),
      batch,
      getBookmark: jest.fn(() => null),
    } as unknown as D1DatabaseSession;
    const db = {
      withSession: jest.fn(() => session),
    } as unknown as D1Database;
    const wrappedSession = withD1Timeout(db).withSession("first-unconstrained");
    const wrappedFirst = wrappedSession.prepare("select 1");
    const wrappedSecond = wrappedSession.prepare("select 2");

    await wrappedSession.batch([wrappedFirst, wrappedSecond]);

    expect(batch).toHaveBeenCalledWith([first, second]);
  });
});
