import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  favoriteStudentD1,
  getD1FavoritedCounts,
  getD1FavoriteRecord,
  getD1UserFavoritedStudents,
  unfavoriteStudentD1,
} from "~/db/d1/favorite-students";
import {
  applyPostgresFavoriteState,
  getPostgresFavoritedCounts,
  getPostgresUserFavoritedStudents,
} from "~/db/postgres/favorite-students";
import {
  favoriteStudent,
  getFavoritedCounts,
  getUserFavoritedStudents,
  resolveFavoriteStudentSourceMode,
  unfavoriteStudent,
} from "~/models/favorite-students";

jest.mock("~/db/d1/favorite-students", () => ({
  favoriteStudentD1: jest.fn(),
  getD1FavoritedCounts: jest.fn(),
  getD1FavoriteRecord: jest.fn(),
  getD1UserFavoritedStudents: jest.fn(),
  unfavoriteStudentD1: jest.fn(),
}));

jest.mock("~/db/postgres/favorite-students", () => ({
  applyPostgresFavoriteState: jest.fn(),
  getPostgresFavoritedCounts: jest.fn(),
  getPostgresUserFavoritedStudents: jest.fn(),
  setPostgresFavoriteState: jest.fn(),
}));

const mockedFavoriteStudentD1 = favoriteStudentD1 as jest.MockedFunction<typeof favoriteStudentD1>;
const mockedUnfavoriteStudentD1 = unfavoriteStudentD1 as jest.MockedFunction<typeof unfavoriteStudentD1>;
const mockedGetD1FavoriteRecord = getD1FavoriteRecord as jest.MockedFunction<typeof getD1FavoriteRecord>;
const mockedGetD1FavoritedCounts = getD1FavoritedCounts as jest.MockedFunction<typeof getD1FavoritedCounts>;
const mockedGetD1UserFavorites = getD1UserFavoritedStudents as jest.MockedFunction<typeof getD1UserFavoritedStudents>;
const mockedApplyPostgresFavoriteState = applyPostgresFavoriteState as jest.MockedFunction<
  typeof applyPostgresFavoriteState
>;
const mockedGetPostgresFavoritedCounts = getPostgresFavoritedCounts as jest.MockedFunction<
  typeof getPostgresFavoritedCounts
>;
const mockedGetPostgresUserFavorites = getPostgresUserFavoritedStudents as jest.MockedFunction<
  typeof getPostgresUserFavoritedStudents
>;

function createContext() {
  const pending: Promise<unknown>[] = [];
  const setAttribute = jest.fn();
  const ctx = {
    waitUntil: jest.fn((promise: Promise<unknown>) => pending.push(promise)),
    tracing: {
      enterSpan: jest.fn(async (_name: string, operation: (span: { setAttribute: typeof setAttribute }) => unknown) =>
        operation({ setAttribute }),
      ),
    },
  } as unknown as ExecutionContext;
  return { ctx, pending, setAttribute };
}

function compareEnv(): Env {
  return { FAVORITE_STUDENT_SOURCE_MODE: "compare" } as Env;
}

describe("favorite student source mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFavoriteStudentD1.mockResolvedValue();
    mockedUnfavoriteStudentD1.mockResolvedValue();
    mockedApplyPostgresFavoriteState.mockResolvedValue();
  });

  it("defaults to D1 and rejects invalid configuration", () => {
    expect(resolveFavoriteStudentSourceMode(undefined)).toBe("d1");
    expect(resolveFavoriteStudentSourceMode("compare")).toBe("compare");
    expect(() => resolveFavoriteStudentSourceMode("fallback")).toThrow(
      "invalid FAVORITE_STUDENT_SOURCE_MODE: fallback",
    );
  });

  it("returns D1 user favorites and observes matching PostgreSQL rows in background", async () => {
    const rows = [{ uid: "favorite-1", studentId: "student-1", contentId: "content-1" }];
    mockedGetD1UserFavorites.mockResolvedValue(rows);
    mockedGetPostgresUserFavorites.mockResolvedValue([...rows]);
    const { ctx, pending, setAttribute } = createContext();

    await expect(getUserFavoritedStudents(compareEnv(), 1, undefined, { ctx })).resolves.toBe(rows);
    await Promise.all(pending);

    expect(setAttribute).toHaveBeenCalledWith("favorite.parity.matched", true);
    expect(setAttribute).toHaveBeenCalledWith("favorite.d1.row_count", 1);
    expect(setAttribute).toHaveBeenCalledWith("favorite.hyperdrive.row_count", 1);
  });

  it("normalizes zero D1 aggregate rows during count parity", async () => {
    mockedGetD1FavoritedCounts.mockResolvedValue([
      { studentId: "student-1", contentId: "content-1", count: 2 },
      { studentId: "student-2", contentId: "content-1", count: 0 },
    ]);
    mockedGetPostgresFavoritedCounts.mockResolvedValue([{ studentId: "student-1", contentId: "content-1", count: 2 }]);
    const { ctx, pending, setAttribute } = createContext();

    await getFavoritedCounts(compareEnv(), ["student-1", "student-2"], undefined, { ctx });
    await Promise.all(pending);

    expect(setAttribute).toHaveBeenCalledWith("favorite.parity.matched", true);
  });

  it("keeps the successful D1 response when PostgreSQL compare fails", async () => {
    const rows = [{ uid: "favorite-1", studentId: "student-1", contentId: "content-1" }];
    mockedGetD1UserFavorites.mockResolvedValue(rows);
    mockedGetPostgresUserFavorites.mockRejectedValue(new Error("postgres unavailable"));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { ctx, pending } = createContext();

    await expect(getUserFavoritedStudents(compareEnv(), 1, undefined, { ctx })).resolves.toBe(rows);
    await Promise.all(pending);

    expect(consoleError).toHaveBeenCalledWith(
      "Favorite read comparison failed",
      expect.objectContaining({ scope: "favorite_compare", queryName: "get_by_user" }),
    );
    consoleError.mockRestore();
  });

  it("schedules desired-state shadow write only after the D1 mutation succeeds", async () => {
    const record = {
      id: 10,
      uid: "favorite-1",
      userId: 1,
      studentId: "student-1",
      contentId: "content-1",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    } as const;
    mockedGetD1FavoriteRecord.mockResolvedValue(record);
    const { ctx, pending } = createContext();

    await favoriteStudent(compareEnv(), 1, "student-1", "content-1", { ctx });
    expect(mockedFavoriteStudentD1).toHaveBeenCalledTimes(1);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    await Promise.all(pending);

    expect(mockedApplyPostgresFavoriteState).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 1, studentId: "student-1", contentId: "content-1" },
      record,
      expect.objectContaining({ ctx }),
    );
  });

  it("shadows an unfavorite as the current absent D1 state", async () => {
    mockedGetD1FavoriteRecord.mockResolvedValue(null);
    const { ctx, pending } = createContext();

    await unfavoriteStudent(compareEnv(), 1, "student-1", "content-1", { ctx });
    expect(mockedUnfavoriteStudentD1).toHaveBeenCalledTimes(1);
    await Promise.all(pending);

    expect(mockedApplyPostgresFavoriteState).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 1, studentId: "student-1", contentId: "content-1" },
      null,
      expect.objectContaining({ ctx }),
    );
  });
});
