import { describe, expect, it, jest } from "@jest/globals";
import type { HeadersFunction } from "react-router";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/mollulog-api", () => ({
  createPersonalApiKey: jest.fn(),
  getPersonalApiKeys: jest.fn(),
  revokePersonalApiKey: jest.fn(),
}));
jest.mock("~/views/developers-history.server", () => ({ getDevelopersHistoryView: jest.fn() }));

import { headers as landingHeaders } from "~/routes/developers._index";
import { headers as historyHeaders } from "~/routes/developers.history";
import { headers as keyHeaders } from "~/routes/developers.keys";

const parentHeaders = new Headers({
  "Cache-Control": "public, max-age=3600",
  "X-Parent-Header": "preserved",
});
const headerArgs: Parameters<HeadersFunction>[0] = {
  loaderHeaders: new Headers(),
  parentHeaders,
  actionHeaders: new Headers(),
  errorHeaders: undefined,
};
const routes: Array<[string, HeadersFunction]> = [
  ["landing", landingHeaders],
  ["key management", keyHeaders],
  ["history", historyHeaders],
];

describe("developer route response headers", () => {
  it.each(routes)("sets private no-store for %s while preserving parent headers", (_route, routeHeaders) => {
    const headers = new Headers(routeHeaders(headerArgs));

    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("X-Parent-Header")).toBe("preserved");
  });
});
