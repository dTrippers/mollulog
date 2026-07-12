import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getPostgresTimelineContents } from "~/db/postgres/timeline-contents";
import type { TimelineContent } from "~/domain/timeline-content";
import { getTimelineContents } from "~/models/timeline-content";
import { loadTimelineContentsForFutures, resolveTimelineContentSourceMode } from "~/views/timeline-content-source";

jest.mock("~/db/postgres/timeline-contents", () => ({
  getPostgresTimelineContents: jest.fn(),
}));

jest.mock("~/models/timeline-content", () => ({
  getTimelineContents: jest.fn(),
}));

const mockedGetD1Contents = getTimelineContents as jest.MockedFunction<typeof getTimelineContents>;
const mockedGetPostgresContents = getPostgresTimelineContents as jest.MockedFunction<
  typeof getPostgresTimelineContents
>;

function content(overrides: Partial<TimelineContent> = {}): TimelineContent {
  return {
    uid: "future-event",
    name: "미래 이벤트",
    nameI18n: { ko: "미래 이벤트" },
    startAt: "2099-08-25T02:00:00.000Z",
    endAt: "2099-09-15T02:00:00.000Z",
    endless: false,
    imageUrl: null,
    videos: [],
    contentType: "event",
    runType: "first",
    occurrence: null,
    contentUid: "event-1",
    shopContentUid: null,
    recruitmentGroupUid: null,
    recruitmentStudentUids: null,
    confirmed: true,
    isSpoiler: false,
    tags: [],
    earnablePyroxene: null,
    syncedAt: null,
    ...overrides,
  };
}

function createContext() {
  const pending: Promise<unknown>[] = [];
  const setAttribute = jest.fn();
  return {
    pending,
    setAttribute,
    ctx: {
      waitUntil: jest.fn((promise: Promise<unknown>) => pending.push(promise)),
      tracing: {
        enterSpan: jest.fn(async (_name: string, fn: (span: { setAttribute: typeof setAttribute }) => unknown) =>
          fn({ setAttribute }),
        ),
      },
    } as unknown as ExecutionContext,
  };
}

describe("timeline content source mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defaults to D1 and rejects invalid configuration", () => {
    expect(resolveTimelineContentSourceMode(undefined)).toBe("d1");
    expect(resolveTimelineContentSourceMode("compare")).toBe("compare");
    expect(() => resolveTimelineContentSourceMode("fallback")).toThrow(
      "invalid TIMELINE_CONTENT_SOURCE_MODE: fallback",
    );
  });

  it("returns D1 immediately in compare mode and records a matching comparison", async () => {
    const source = [content()];
    mockedGetD1Contents.mockResolvedValue(source);
    mockedGetPostgresContents.mockResolvedValue([content()]);
    const { ctx, pending, setAttribute } = createContext();

    await expect(loadTimelineContentsForFutures({} as Env, "compare", ctx)).resolves.toBe(source);
    await Promise.all(pending);

    expect(setAttribute).toHaveBeenCalledWith("timeline.parity.matched", true);
    expect(setAttribute).toHaveBeenCalledWith("timeline.d1.row_count", 1);
    expect(setAttribute).toHaveBeenCalledWith("timeline.hyperdrive.row_count", 1);
  });

  it("keeps returning D1 when the Hyperdrive comparison fails", async () => {
    const source = [content()];
    const error = new Error("postgres unavailable");
    mockedGetD1Contents.mockResolvedValue(source);
    mockedGetPostgresContents.mockRejectedValue(error);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, pending } = createContext();

    await expect(loadTimelineContentsForFutures({} as Env, "compare", ctx)).resolves.toBe(source);
    await Promise.all(pending);

    expect(consoleError).toHaveBeenCalledWith("[timeline-compare] comparison failed", {
      name: "Error",
      message: "postgres unavailable",
      code: undefined,
    });
    consoleError.mockRestore();
  });
});
