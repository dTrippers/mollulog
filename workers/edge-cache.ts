const EDGE_CACHE_PATHS = new Set(["/", "/futures"]);
const EDGE_CACHE_TTL_SECONDS = 60;
const EDGE_CACHE_HEADER = "x-mllg-edge-cache";
const CLIENT_HIT_CACHE_CONTROL = "private, no-cache";
const STORED_CACHE_CONTROL = `public, max-age=${EDGE_CACHE_TTL_SECONDS}`;
const BYPASS_COOKIE_NAMES = new Set(["__session", "preference"]);

export async function handleEdgeCachedDocumentRequest(
  request: Request,
  ctx: ExecutionContext,
  fetchHandler: () => Promise<Response>,
): Promise<Response> {
  const cacheKey = getEdgeCacheKey(request);
  if (!cacheKey || hasBypassCookie(request.headers.get("Cookie"))) {
    return fetchHandler();
  }

  const cache = getDefaultCache();
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return withEdgeCacheHeader(cachedResponse, "hit");
  }

  const response = await fetchHandler();
  if (isStorableResponse(response)) {
    ctx.waitUntil(cache.put(cacheKey, toStoredResponse(response.clone())));
  }

  return withEdgeCacheHeader(response, "miss");
}

function getEdgeCacheKey(request: Request): Request | null {
  if (request.method !== "GET") {
    return null;
  }

  const url = new URL(request.url);
  if (!EDGE_CACHE_PATHS.has(url.pathname)) {
    return null;
  }

  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

function hasBypassCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) {
    return false;
  }

  return cookieHeader.split(";").some((cookie) => {
    const [name] = cookie.split("=");
    return BYPASS_COOKIE_NAMES.has(name.trim());
  });
}

function isStorableResponse(response: Response): boolean {
  return response.status === 200 && !response.headers.has("Set-Cookie");
}

function getDefaultCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

function toStoredResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", STORED_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withEdgeCacheHeader(response: Response, cacheStatus: "hit" | "miss"): Response {
  const headers = new Headers(response.headers);
  headers.set(EDGE_CACHE_HEADER, cacheStatus);
  if (cacheStatus === "hit") {
    headers.set("Cache-Control", CLIENT_HIT_CACHE_CONTROL);
    headers.set("Server-Timing", "edge_cache;dur=0");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
