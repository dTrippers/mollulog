import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";

const mockAuth = { getActiveSensei: jest.fn<(...args: unknown[]) => Promise<unknown>>() };
const mockView = { getDataHistoryView: jest.fn<(...args: unknown[]) => Promise<unknown>>() };
jest.mock("~/auth/authenticator.server", () => mockAuth);
jest.mock("~/views/data-history.server", () => mockView);

import { loader } from "~/routes/data-history";
import { loader as legacyLoader } from "~/routes/developers.history";

const context = { cloudflare: { env: {}, ctx: {} } } as LoaderFunctionArgs["context"];
const args = (path: string): LoaderFunctionArgs => ({
  context,
  request: new Request(`http://127.0.0.1:8789${path}`),
  params: {},
  url: new URL(`http://127.0.0.1:8789${path}`),
  pattern: "/data-history",
});
const history = {
  events: [],
  filter: "all",
  nextCursor: null,
  studentsByUid: {},
  itemNamesByUid: {},
  apiKeysByUid: {},
};

describe("standalone data history loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.getActiveSensei.mockResolvedValue({ id: 5 });
    mockView.getDataHistoryView.mockResolvedValue(history);
  });

  it("blocks unauthenticated access before fetching personal history", async () => {
    mockAuth.getActiveSensei.mockResolvedValue(null);
    const result = await loader(args("/data-history"));
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected redirect");
    expect(result.headers.get("Location")).toBe("/unauthorized");
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mockView.getDataHistoryView).not.toHaveBeenCalled();
  });

  it("forwards the selected filter and cursor for the signed-in user", async () => {
    const result = await loader(args("/data-history?filter=api&cursor=next-page"));
    expect(mockView.getDataHistoryView).toHaveBeenCalledWith({}, 5, { ctx: {}, filter: "api", cursor: "next-page" });
    expect(result).toMatchObject({
      data: { ...history, loadError: false },
      init: { headers: { "Cache-Control": "private, no-store" } },
    });
  });

  it("resets unknown filters to all", async () => {
    await loader(args("/data-history?filter=unknown"));
    expect(mockView.getDataHistoryView).toHaveBeenCalledWith({}, 5, { ctx: {}, filter: "all", cursor: null });
  });

  it("keeps load failures distinct from an empty history", async () => {
    mockView.getDataHistoryView.mockRejectedValue(new Error("Private backend detail"));
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await loader(args("/data-history?filter=data"));
      expect(result).toMatchObject({ data: { events: [], filter: "data", loadError: true } });
      expect(JSON.stringify(result)).not.toContain("Private backend detail");
    } finally {
      log.mockRestore();
    }
  });

  it("preserves filter and cursor when redirecting the old URL", () => {
    const result = legacyLoader(args("/developers/history?filter=direct&cursor=next%2Fpage"));
    expect(result.headers.get("Location")).toBe("/data-history?filter=direct&cursor=next%2Fpage");
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
