import { describe, expect, it, jest } from "@jest/globals";
import type { AppLoadContext, EntryContext } from "react-router";

jest.mock("isbot", () => ({ isbot: () => false }));
jest.mock("react-dom/server", () => ({
  renderToReadableStream: jest.fn(
    async () => new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
  ),
}));
jest.mock("react-dom/static", () => ({ prerender: jest.fn() }));
jest.mock("~/lib/io-watchdog", () => ({ watchIo: (_name: string, promise: Promise<unknown>) => promise }));
jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: () => ({ error: jest.fn(), info: jest.fn() }),
}));
jest.mock("~/lib/request-diagnostics", () => ({
  createRequestDiagnostics: (request: Request, version: string) => ({
    renderId: "test-render-id",
    requestPath: new URL(request.url).pathname,
    buildId: version,
  }),
}));
jest.mock("~/lib/seo-crawler", () => ({
  isGoogleSearchCrawler: () => false,
  isSenseiProfilePath: () => false,
  materializeReactSuspenseBoundaries: jest.fn(),
  requiresSelfCanonical: jest.fn(),
  stripExecutableScripts: jest.fn(),
  validateSeoDocumentInvariant: jest.fn(),
}));
jest.mock("~/lib/seo", () => ({ canonicalUrl: jest.fn() }));

import handleRequest from "~/entry.server";

const loadContext = {
  cloudflare: { env: {}, ctx: {} },
} as unknown as AppLoadContext;
const routerContext = {
  manifest: { version: "test-build-id" },
  staticHandlerContext: {
    location: { pathname: "/developers" },
    matches: [],
  },
} as unknown as EntryContext;

async function renderDocument(cacheControl?: string) {
  const headers = new Headers();
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  return handleRequest(
    new Request("https://mollulog.test/developers", { headers: { "User-Agent": "Mozilla/5.0" } }),
    200,
    headers,
    routerContext,
    loadContext,
  );
}

describe("document Cache-Control", () => {
  it("keeps the default no-store, no-transform policy", async () => {
    const response = await renderDocument();

    expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
  });

  it("retains a private route directive alongside the document policy", async () => {
    const response = await renderDocument("private, no-store");

    expect(response.headers.get("Cache-Control")).toBe("private, no-store, no-transform");
  });
});
