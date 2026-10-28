import { describe, expect, it, jest } from "@jest/globals";
import type { AppLoadContext, EntryContext } from "react-router";

let botRequest = false;
jest.mock("isbot", () => ({ isbot: () => botRequest }));
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

async function renderDocument(acceptEncoding: string | null, clientAcceptEncoding?: string) {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (acceptEncoding !== null) headers["Accept-Encoding"] = acceptEncoding;
  const request = new Request("https://mollulog.test/developers", { headers });
  if (clientAcceptEncoding !== undefined) {
    Object.defineProperty(request, "cf", { value: { clientAcceptEncoding } });
  }
  return handleRequest(request, 200, new Headers(), routerContext, loadContext);
}

describe("document compression", () => {
  it("asks the runtime to gzip documents for visitors that accept gzip", async () => {
    botRequest = false;
    const response = await renderDocument("gzip, deflate, br, zstd");

    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Vary")).toBe("User-Agent, Accept-Encoding");
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
  });

  it.each([
    null,
    "identity",
    "br",
    "gzip;q=0",
    "gzip; q=0.0",
  ])("leaves the document unencoded for %p", async (value) => {
    botRequest = false;
    const response = await renderDocument(value);

    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(response.headers.get("Vary")).toBe("User-Agent");
  });

  it("follows the visitor's original Accept-Encoding when Cloudflare rewrote the header", async () => {
    botRequest = false;
    const refused = await renderDocument("br, gzip", "identity;q=1, gzip;q=0");
    expect(refused.headers.get("Content-Encoding")).toBeNull();

    const accepted = await renderDocument("br, gzip", "gzip, deflate");
    expect(accepted.headers.get("Content-Encoding")).toBe("gzip");
  });

  it("leaves bot documents unencoded", async () => {
    botRequest = true;
    const response = await renderDocument("gzip");

    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(response.headers.get("Vary")).toBe("User-Agent");
  });
});
