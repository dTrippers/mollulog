import { describe, expect, it, jest } from "@jest/globals";
import { getEventContentSchedule, getEventContentsList, getEventShopContent } from "~/models/event-content";
import { getAllTimelineContentsMeta } from "~/models/timeline-content.server";
import { warmActiveUpcomingEventContent } from "~/views/events";

jest.mock("~/lib/cache", () => ({
  cacheKey: (category: string, domain: string, version: number, query: string) =>
    `${category}::${domain}::v${version}::${query}`,
  fetchRouteCached: jest.fn((_env: unknown, _ctx: unknown, _key: string, loader: () => Promise<unknown>) => loader()),
}));

jest.mock("~/models/event-content", () => ({
  getEventContentSchedule: jest.fn(),
  getEventContentsList: jest.fn(),
  getEventShopContent: jest.fn(),
}));

jest.mock("~/models/timeline-content.server", () => ({
  getAllTimelineContentsMeta: jest.fn(),
}));

const mockedGetEventContentSchedule = getEventContentSchedule as jest.MockedFunction<typeof getEventContentSchedule>;
const mockedGetEventContentsList = getEventContentsList as jest.MockedFunction<typeof getEventContentsList>;
const mockedGetEventShopContent = getEventShopContent as jest.MockedFunction<typeof getEventShopContent>;
const mockedGetAllTimelineContentsMeta = getAllTimelineContentsMeta as jest.MockedFunction<
  typeof getAllTimelineContentsMeta
>;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createEventContent(uid: string) {
  return {
    uid,
    name: uid,
    schedules: [
      {
        region: "gl",
        runType: "first",
        startAt: new Date("2026-01-01T00:00:00.000Z"),
        endAt: null,
      },
    ],
  } as unknown as Awaited<ReturnType<typeof getEventContentsList>>[number];
}

function createTimelineContent(uid: string, contentUid: string) {
  return {
    uid,
    name: contentUid,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: null,
    contentType: "event",
    contentUid,
  } as Awaited<ReturnType<typeof getAllTimelineContentsMeta>>[number];
}

describe("warmActiveUpcomingEventContent", () => {
  it("shares a concurrency limit of six across schedule and shop warm tasks", async () => {
    const env = {} as Env;
    const eventUids = ["event-1", "event-2", "event-3", "event-4"];
    const firstSixStarted = createDeferred();
    const allTasksStarted = createDeferred();
    const pendingTasks: Deferred[] = [];
    let startedTaskCount = 0;
    let activeTaskCount = 0;
    let maxActiveTaskCount = 0;

    mockedGetEventContentsList.mockResolvedValue(eventUids.map(createEventContent));
    mockedGetAllTimelineContentsMeta.mockResolvedValue(
      eventUids.map((uid, index) => createTimelineContent(`timeline-${index + 1}`, uid)),
    );

    const runWarmTask = async () => {
      startedTaskCount += 1;
      activeTaskCount += 1;
      maxActiveTaskCount = Math.max(maxActiveTaskCount, activeTaskCount);
      if (startedTaskCount === 6) {
        firstSixStarted.resolve();
      }
      if (startedTaskCount === 8) {
        allTasksStarted.resolve();
      }

      const pendingTask = createDeferred();
      pendingTasks.push(pendingTask);
      try {
        await pendingTask.promise;
      } finally {
        activeTaskCount -= 1;
      }
    };
    mockedGetEventContentSchedule.mockImplementation(async () => {
      await runWarmTask();
      return null;
    });
    mockedGetEventShopContent.mockImplementation(async () => {
      await runWarmTask();
      return null;
    });

    const warmPromise = warmActiveUpcomingEventContent(env);

    await firstSixStarted.promise;
    expect(activeTaskCount).toBe(6);
    expect(mockedGetEventContentSchedule).toHaveBeenCalledTimes(4);
    expect(mockedGetEventShopContent).toHaveBeenCalledTimes(2);

    for (const task of pendingTasks.splice(0, 2)) {
      task.resolve();
    }
    await allTasksStarted.promise;
    expect(activeTaskCount).toBe(6);

    for (const task of pendingTasks.splice(0)) {
      task.resolve();
    }
    await expect(warmPromise).resolves.toBeUndefined();
    expect(maxActiveTaskCount).toBe(6);
    expect(mockedGetEventContentSchedule).toHaveBeenCalledTimes(4);
    expect(mockedGetEventShopContent).toHaveBeenCalledTimes(4);
  });
});
