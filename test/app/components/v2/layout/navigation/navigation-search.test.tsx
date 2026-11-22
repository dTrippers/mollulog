/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NavigationSearch } from "~/components/v2/layout/navigation/NavigationBar";

jest.mock("react-router", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode } & Record<string, unknown>) =>
      createElement("a", { href: to, ...props }, children),
    MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
    useMatches: () => [],
    useNavigate: () => () => undefined,
  };
});

describe("navigation search", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "fetch");
  });

  function renderSearch() {
    return render(
      <MemoryRouter>
        <NavigationSearch variant="desktop" />
      </MemoryRouter>,
    );
  }

  async function advanceDebounce() {
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function submitQuery(value = "학생") {
    fireEvent.change(screen.getByRole("searchbox", { name: "전역 검색" }), { target: { value } });
    await advanceDebounce();
  }

  function searchResponse(results: unknown[]) {
    return { ok: true, json: async () => ({ results }) } as Response;
  }

  function mockFetch() {
    const fetchMock = jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: fetchMock });
    return fetchMock;
  }

  it("does not show a popup before a non-empty query and shows loading after typing", async () => {
    mockFetch().mockImplementation(() => new Promise<Response>(() => undefined));
    renderSearch();

    const input = screen.getByRole("searchbox", { name: "전역 검색" });
    expect(input.className).toContain("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus");
    expect(input.className).not.toContain("outline-none");
    fireEvent.focus(input);
    expect(screen.queryByRole("status")).toBeNull();

    await submitQuery();

    expect(screen.getByRole("status", { name: "검색 중" })).toBeTruthy();
  });

  it("shows an explicit error when the search request fails", async () => {
    mockFetch().mockRejectedValue(new Error("network failure"));
    renderSearch();

    await submitQuery();

    expect(screen.getByRole("alert").textContent).toContain("검색하지 못했어요");
  });

  it("shows the empty result state", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    renderSearch();

    await submitQuery();

    expect(screen.getByText("결과가 없어요")).toBeTruthy();
  });

  it("keeps event type and date metadata without student or feature row labels", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { type: "student", name: "아로나", uid: "student-1", to: "/students/student-1" },
          { type: "menu", name: "학생부", to: "/students" },
          {
            type: "event",
            name: "총력전",
            uid: "event-1",
            to: "/events/event-1",
            contentType: "event",
            startAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      }),
    } as Response);
    renderSearch();

    await submitQuery();

    expect(screen.getByText("아로나")).toBeTruthy();
    expect(screen.getByText("학생부")).toBeTruthy();
    expect(screen.getByText("이벤트 · 2026-08-01")).toBeTruthy();
    expect(screen.getByText("총력전")).toBeTruthy();
    expect(screen.queryByText("학생", { exact: true })).toBeNull();
    expect(screen.queryByText("기능", { exact: true })).toBeNull();
  });

  it("keeps loaded results when the input adds trailing whitespace", async () => {
    const fetchMock = mockFetch().mockResolvedValue(
      searchResponse([{ type: "menu", name: "학생 검색 결과", to: "/students" }]),
    );
    renderSearch();

    await submitQuery();
    const input = screen.getByRole("searchbox", { name: "전역 검색" });
    fireEvent.change(input, { target: { value: "학생 " } });
    expect(screen.getByText("학생 검색 결과")).toBeTruthy();

    await advanceDebounce();

    expect(screen.getByText("학생 검색 결과")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("restores the original result after a rapid edit and revert within the debounce window", async () => {
    const fetchMock = mockFetch().mockResolvedValue(
      searchResponse([{ type: "menu", name: "학생 검색 결과", to: "/students" }]),
    );
    renderSearch();

    await submitQuery();
    const input = screen.getByRole("searchbox", { name: "전역 검색" });
    fireEvent.change(input, { target: { value: "학생부" } });
    expect(screen.queryByText("학생 검색 결과")).toBeNull();
    fireEvent.change(input, { target: { value: "학생" } });

    await advanceDebounce();

    expect(screen.getByText("학생 검색 결과")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads results for a genuinely different normalized query", async () => {
    const fetchMock = mockFetch()
      .mockResolvedValueOnce(searchResponse([{ type: "menu", name: "첫 검색 결과", to: "/students" }]))
      .mockResolvedValueOnce(searchResponse([{ type: "menu", name: "새 검색 결과", to: "/students" }]));
    renderSearch();

    await submitQuery();
    await submitQuery("학생부");

    expect(screen.getByText("새 검색 결과")).toBeTruthy();
    expect(screen.queryByText("첫 검색 결과")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
