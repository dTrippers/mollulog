import { describe, expect, it } from "@jest/globals";
import { handleEdgeCachedDocumentRequest } from "../../workers/edge-cache";

class MemoryCache {
  readonly entries = new Map<string, Response>();
  readonly puts: { request: Request; response: Response }[] = [];

  async match(request: Request): Promise<Response | undefined> {
    return this.entries.get(request.url);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.puts.push({ request, response });
    this.entries.set(request.url, response);
  }
}

function installCache(cache: MemoryCache) {
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: cache },
  });
}

function createExecutionContext() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    passThroughOnException() {},
    props: {},
  } as ExecutionContext;

  return { ctx, pending };
}

describe("handleEdgeCachedDocumentRequest", () => {
  it("stores eligible anonymous document misses with a 60 second cache ttl", async () => {
    const cache = new MemoryCache();
    installCache(cache);
    const { ctx, pending } = createExecutionContext();

    const response = await handleEdgeCachedDocumentRequest(
      new Request("https://mollulog.net/futures?utm_source=test", {
        headers: { Cookie: "analytics_id=abc" },
      }),
      ctx,
      async () => new Response("fresh", { headers: { "Cache-Control": "private, no-cache" } }),
    );
    await Promise.all(pending);

    expect(response.headers.get("x-mllg-edge-cache")).toBe("miss");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(cache.puts).toHaveLength(1);
    expect(cache.puts[0].request.url).toBe("https://mollulog.net/futures");
    expect(cache.puts[0].response.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns hits with private client cache control and edge timing", async () => {
    const cache = new MemoryCache();
    cache.entries.set(
      "https://mollulog.net/",
      new Response("cached", {
        headers: {
          "Cache-Control": "public, max-age=60",
          "Server-Timing": "auth;dur=10",
        },
      }),
    );
    installCache(cache);
    const { ctx } = createExecutionContext();
    let handlerCalls = 0;

    const response = await handleEdgeCachedDocumentRequest(
      new Request("https://mollulog.net/?foo=bar"),
      ctx,
      async () => {
        handlerCalls += 1;
        return new Response("fresh");
      },
    );

    expect(handlerCalls).toBe(0);
    expect(await response.text()).toBe("cached");
    expect(response.headers.get("x-mllg-edge-cache")).toBe("hit");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("Server-Timing")).toBe("edge_cache;dur=0");
  });

  it("bypasses when a session or preference cookie is present", async () => {
    const cache = new MemoryCache();
    installCache(cache);
    const { ctx, pending } = createExecutionContext();

    const sessionResponse = await handleEdgeCachedDocumentRequest(
      new Request("https://mollulog.net/futures", {
        headers: { Cookie: "analytics_id=abc; __session=secret" },
      }),
      ctx,
      async () => new Response("session"),
    );
    const preferenceResponse = await handleEdgeCachedDocumentRequest(
      new Request("https://mollulog.net/", {
        headers: { Cookie: "preference=dark" },
      }),
      ctx,
      async () => new Response("preference"),
    );
    await Promise.all(pending);

    expect(await sessionResponse.text()).toBe("session");
    expect(await preferenceResponse.text()).toBe("preference");
    expect(sessionResponse.headers.get("x-mllg-edge-cache")).toBeNull();
    expect(preferenceResponse.headers.get("x-mllg-edge-cache")).toBeNull();
    expect(cache.puts).toHaveLength(0);
  });

  it("does not store non-200 or Set-Cookie responses", async () => {
    const cache = new MemoryCache();
    installCache(cache);
    const { ctx, pending } = createExecutionContext();

    const setCookieResponse = await handleEdgeCachedDocumentRequest(
      new Request("https://mollulog.net/"),
      ctx,
      async () => new Response("cookie", { headers: { "Set-Cookie": "__session=secret" } }),
    );
    const notFoundResponse = await handleEdgeCachedDocumentRequest(
      new Request("https://mollulog.net/futures"),
      ctx,
      async () => new Response("missing", { status: 404 }),
    );
    await Promise.all(pending);

    expect(setCookieResponse.headers.get("x-mllg-edge-cache")).toBe("miss");
    expect(notFoundResponse.headers.get("x-mllg-edge-cache")).toBe("miss");
    expect(cache.puts).toHaveLength(0);
  });
});
