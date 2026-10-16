/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLoaderData } from "react-router";
import { type HomeViewerState, useHomeViewerState } from "~/routes/_index._components/home-viewer-state";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));

// The server state the loader reads. A write changes it, and the revalidation after the write loads it again.
type ServerState = {
  favorites: { contentId: string; studentId: string }[];
  results: {
    recruitmentGroupUid: string;
    completedAt: string | null;
    recruitedStudents: { studentUid: string }[];
    exchangedStudents: { studentUid: string }[];
  }[];
  counts: { contentId: string; studentId: string; count: number }[];
};

let server: ServerState;
let loaderCalls: number;
let current: HomeViewerState | undefined;
const fetchMock = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();

// The answers of the write routes. A resource route returns `null` as `Response.json(null)`, so a favorite write that succeeds
// answers 200 with the JSON body `null`. A completion write answers 200 with `{ success: true, ... }`, and a failed one an error
// status with JSON.
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    type: "basic",
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body,
  } as unknown as Response;
}

// A write that the route redirected to the sign-in page, as it comes back with `redirect: "manual"`: an opaque response with
// status 0 and no body.
function manualRedirect(): Response {
  return {
    ok: false,
    status: 0,
    redirected: false,
    type: "opaqueredirect",
    headers: { get: () => null },
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  } as unknown as Response;
}

// The same redirect with its page followed: a 200 HTML answer, which a write must never count as success.
function followedRedirect(): Response {
  return {
    ok: true,
    status: 200,
    redirected: true,
    type: "basic",
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  } as unknown as Response;
}

// Every load reads a copy of the server state, so a later write never changes an earlier result.
function loadServer() {
  loaderCalls += 1;
  const snapshot = JSON.parse(JSON.stringify(server)) as ServerState;
  return {
    viewer: Promise.resolve({
      favorites: { status: "available", value: snapshot.favorites },
      results: { status: "available", value: snapshot.results },
    }),
    favoritedCounts: Promise.resolve({ status: "success", data: snapshot.counts }),
  };
}

function Probe() {
  const loaded = useLoaderData() as ReturnType<typeof loadServer>;
  // The fixtures carry only the fields the hook reads, so they are cast at this boundary.
  current = useHomeViewerState({
    signedIn: true,
    viewer: loaded.viewer as never,
    favoritedCounts: loaded.favoritedCounts as never,
  });
  return null;
}

function renderHome() {
  const router = createMemoryRouter(
    [{ path: "/", Component: Probe, HydrateFallback: () => null, loader: loadServer }],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

const completionMeta = { tier: 3, pickup: true, recruitmentType: "usual" } as never;

describe("home viewer state", () => {
  beforeEach(() => {
    installLayoutTestEnv();
    server = { favorites: [], results: [], counts: [] };
    loaderCalls = 0;
    current = undefined;
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: fetchMock });
  });

  it("shows a favorite as one when its count was zero, and keeps it once the loader returns the fresh count", async () => {
    fetchMock.mockImplementation(async () => {
      // The server stores the favorite before it answers, so the next load carries it.
      server = {
        ...server,
        favorites: [{ contentId: "event-1", studentId: "student-1" }],
        counts: [{ contentId: "event-1", studentId: "student-1", count: 1 }],
      };
      return jsonResponse(null);
    });
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));
    await waitFor(() => expect(current?.favoriteCount("event-1", "student-1")).toBe(0));

    act(() => current?.toggleFavorite("event-1", "student-1", true));
    expect(current?.favoriteCount("event-1", "student-1")).toBe(1);
    expect(current?.isFavorited("event-1", "student-1")).toBe(true);

    await waitFor(() => expect(loaderCalls).toBe(2));
    await waitFor(() => expect(current?.favoriteCount("event-1", "student-1")).toBe(1));
    expect(current?.isFavorited("event-1", "student-1")).toBe(true);
  });

  it.each([
    ["a manual redirect", manualRedirect],
    ["a followed redirect to an HTML page", followedRedirect],
  ])("rolls back a favorite whose write comes back as %s", async (_label, redirected) => {
    fetchMock.mockImplementation(async () => redirected());
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));
    await waitFor(() => expect(current?.favoriteCount("event-1", "student-1")).toBe(0));

    act(() => current?.toggleFavorite("event-1", "student-1", true));
    expect(current?.isFavorited("event-1", "student-1")).toBe(true);
    expect(current?.favoriteCount("event-1", "student-1")).toBe(1);

    await waitFor(() => expect(loaderCalls).toBe(2));
    await waitFor(() => expect(current?.isFavorited("event-1", "student-1")).toBe(false));
    expect(current?.favoriteCount("event-1", "student-1")).toBe(0);
    // The write asks the browser not to follow a redirect.
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([
    ["a manual redirect", manualRedirect],
    ["a followed redirect to an HTML page", followedRedirect],
  ])("rolls back a completion whose write comes back as %s", async (_label, redirected) => {
    fetchMock.mockImplementation(async () => redirected());
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));
    expect(current?.isCompleted("group-1", "student-1")).toBe(false);

    act(() => current?.toggleComplete("group-1", "event-1", "student-1", true, completionMeta));
    expect(current?.isCompleted("group-1", "student-1")).toBe(true);

    await waitFor(() => expect(loaderCalls).toBe(2));
    await waitFor(() => expect(current?.isCompleted("group-1", "student-1")).toBe(false));
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("keeps a completion that the server answers with success", async () => {
    fetchMock.mockImplementation(async () => {
      server = {
        ...server,
        results: [
          {
            recruitmentGroupUid: "group-1",
            completedAt: "2026-10-16T00:00:00.000Z",
            recruitedStudents: [{ studentUid: "student-1" }],
            exchangedStudents: [],
          },
        ],
      };
      return jsonResponse({ success: true, result: null });
    });
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));

    act(() => current?.toggleComplete("group-1", "event-1", "student-1", true, completionMeta));
    await waitFor(() => expect(loaderCalls).toBe(2));
    await waitFor(() => expect(current?.isCompleted("group-1", "student-1")).toBe(true));
  });

  it("rolls back a completion that the server answers with a 200 that does not say success", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ success: false }));
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));

    act(() => current?.toggleComplete("group-1", "event-1", "student-1", true, completionMeta));
    expect(current?.isCompleted("group-1", "student-1")).toBe(true);

    await waitFor(() => expect(loaderCalls).toBe(2));
    await waitFor(() => expect(current?.isCompleted("group-1", "student-1")).toBe(false));
  });

  it("shows a rejected completion as not completed once the server answers", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "Recruitment completion is not allowed" }, 400));
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));
    expect(current?.isCompleted("group-1", "student-1")).toBe(false);

    act(() => current?.toggleComplete("group-1", "event-1", "student-1", true, completionMeta));
    expect(current?.isCompleted("group-1", "student-1")).toBe(true);

    await waitFor(() => expect(loaderCalls).toBe(2));
    await waitFor(() => expect(current?.isCompleted("group-1", "student-1")).toBe(false));
  });

  it("counts a student of the exchanged list of a completed result, and not one of an open result", async () => {
    server.results = [
      {
        recruitmentGroupUid: "group-1",
        completedAt: "2026-10-01T00:00:00.000Z",
        recruitedStudents: [],
        exchangedStudents: [{ studentUid: "student-x" }],
      },
      {
        recruitmentGroupUid: "group-2",
        completedAt: null,
        recruitedStudents: [{ studentUid: "student-y" }],
        exchangedStudents: [],
      },
    ];
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));

    expect(current?.isCompleted("group-1", "student-x")).toBe(true);
    expect(current?.isCompleted("group-2", "student-y")).toBe(false);
  });

  it("keeps the outcome of each quick toggle on its own student", async () => {
    // Each write waits for its own answer, so the test decides the order in which the two answers arrive.
    const answers = new Map<string, (response: Response) => void>();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((resolve) => {
          const body = JSON.parse(String(init?.body)) as { favorite: { studentUid: string } };
          answers.set(body.favorite.studentUid, resolve);
        }),
    );
    renderHome();
    await waitFor(() => expect(current?.status).toBe("ready"));

    act(() => {
      current?.toggleFavorite("event-1", "student-1", true);
      current?.toggleFavorite("event-1", "student-2", true);
    });
    expect(current?.isFavorited("event-1", "student-1")).toBe(true);
    expect(current?.isFavorited("event-1", "student-2")).toBe(true);

    // The first write is redirected to the sign-in page, and the server stores only the second student's favorite.
    server.favorites = [{ contentId: "event-1", studentId: "student-2" }];
    act(() => answers.get("student-1")?.(manualRedirect()));
    act(() => answers.get("student-2")?.(jsonResponse(null)));

    // Both answers are handled before the assertions: the failed one rolls back, and the confirmed one stays on the server.
    await waitFor(() => expect(current?.isFavorited("event-1", "student-1")).toBe(false));
    await waitFor(() => expect(loaderCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(current?.isFavorited("event-1", "student-2")).toBe(true));
    expect(current?.isFavorited("event-1", "student-1")).toBe(false);
  });
});
