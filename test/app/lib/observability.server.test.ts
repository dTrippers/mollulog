import { describe, expect, it, jest } from "@jest/globals";
import * as Sentry from "@sentry/cloudflare";
import { captureServerError, createServerSentryOptions, scrubServerSentryEvent } from "~/lib/observability.server";

type WorkerRequest = Parameters<NonNullable<ExportedHandler["fetch"]>>[0];

/** Runs one request through the real `withSentry` wrapper and collects every envelope it would send. */
async function runWithSentry(request: Request, fetch: (request: WorkerRequest) => Promise<Response>) {
  const sent: string[] = [];
  const handler = Sentry.withSentry<Env & { SERVER_SENTRY_DSN?: string }>(
    (env) => ({
      ...createServerSentryOptions(env),
      transport: () => ({
        send: async (envelope: unknown) => {
          sent.push(JSON.stringify(envelope));
          return {};
        },
        flush: async () => true,
      }),
    }),
    { fetch },
  );
  const waits: Promise<unknown>[] = [];
  const response = await handler.fetch?.(
    request as unknown as WorkerRequest,
    { SERVER_SENTRY_DSN: "https://public@o0.ingest.sentry.io/0", STAGE: "test" } as unknown as Env,
    { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException: () => {} } as never,
  );
  await response?.text();
  await Promise.all(waits);
  await Sentry.flush(2_000);
  return { response, sent };
}

describe("server Sentry options", () => {
  it("never sends request credentials in a captured worker error event", async () => {
    const token = `mllg_${"a".repeat(64)}`;
    const { response, sent } = await runWithSentry(
      new Request("https://api.mollulog.net/v1/me/students", {
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: "__session=session-secret",
          "User-Agent": "sync-agent",
        },
      }),
      async () => {
        captureServerError(new Error("hyperdrive connection reset"), { handler: "test" });
        return new Response(null, { status: 503 });
      },
    );

    expect(response?.status).toBe(503);
    const payload = sent.join("\n");
    expect(payload).toContain("hyperdrive connection reset");
    expect(payload).toContain("sync-agent");
    expect(payload).not.toContain(token);
    expect(payload).not.toContain("session-secret");
  });

  it("does not start a transaction from a caller's sampled sentry-trace header", async () => {
    const token = `mllg_${"b".repeat(64)}`;
    const { response, sent } = await runWithSentry(
      new Request("https://api.mollulog.net/v1/me/students", {
        headers: {
          Authorization: `Bearer ${token}`,
          "sentry-trace": "12345678901234567890123456789012-1234567890123456-1",
        },
      }),
      async () => new Response("ok"),
    );

    expect(response?.status).toBe(200);
    expect(sent).toEqual([]);
  });

  it("leaves an unread request body to the handler instead of reading it first", async () => {
    const chunk = new Uint8Array(64 * 1024).fill(97);
    let bytesPulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (bytesPulled >= 4 * 1024 * 1024) {
          controller.close();
          return;
        }
        bytesPulled += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const { response } = await runWithSentry(
      new Request("https://api.mollulog.net/v1/me/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit),
      async () => new Response(null, { status: 401 }),
    );

    expect(response?.status).toBe(401);
    // The stream may buffer its first chunk on creation; nothing beyond that is read.
    expect(bytesPulled).toBeLessThanOrEqual(chunk.length);
  });

  it("drops cookie headers and parsed cookies, which the Node test request cannot carry", () => {
    const event = scrubServerSentryEvent({
      request: {
        headers: { Cookie: "__session=session-secret", "Proxy-Authorization": "Basic secret", accept: "*/*" },
        cookies: { __session: "session-secret" },
      },
    });
    expect(event.request).toEqual({ headers: { accept: "*/*" } });
  });

  it("disables default PII and removes URLs, query data, disallowed headers, and user context", () => {
    const options = createServerSentryOptions({ STAGE: "test" } as unknown as Env);
    expect(options.sendDefaultPii).toBe(false);
    const event = scrubServerSentryEvent({
      request: {
        url: "https://mollulog.net/contact/private-ticket?token=secret",
        query_string: "token=secret",
        data: { body: "private message" },
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "test-agent",
          authorization: "Bearer secret",
          "x-forwarded-for": "192.0.2.1",
        },
      },
      user: { id: "user-123", email: "alice@example.com" },
      contexts: { user: { username: "alice" }, route: { pattern: "/contact/:uid" } },
      extra: { searchTerm: "private search" },
    });

    expect(event.request).toEqual({
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "test-agent",
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.contexts).toEqual({ route: { pattern: "/contact/:uid" } });
    expect(event.extra).toEqual({});
    expect(JSON.stringify(event)).not.toMatch(
      /private-ticket|token=secret|user-123|alice@example|192\.0\.2\.1|private search/,
    );
  });

  it("strips Drizzle params and Postgres detail fields from captured server errors", async () => {
    const postgresError = new Error("duplicate key value violates unique constraint") as Error & { detail: string };
    postgresError.detail = "Key (email)=(alice@example.com) already exists";
    const queryError = new Error(
      'Failed query: insert into account (email) values ($1)\nparams: ["alice@example.com"]',
      { cause: postgresError },
    );
    queryError.name = "DrizzleQueryError";

    const { sent } = await runWithSentry(new Request("https://api.mollulog.net/v1/me/students"), async () => {
      captureServerError(queryError, { operation: "create-account", userId: 42 });
      return new Response(null, { status: 500 });
    });

    const payload = sent.join("\n");
    expect(payload).toContain("insert into account (email) values ($1)");
    expect(payload).toContain("duplicate key value violates unique constraint");
    expect(payload).not.toMatch(/params:|alice@example\.com|userId/);
  });

  it("drops console breadcrumbs and strips URLs from outbound fetch breadcrumbs", async () => {
    const outboundFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    try {
      const { sent } = await runWithSentry(
        new Request("https://mollulog.net/@secretuser/students?q=secretquery", {
          headers: {
            Referer: "https://mollulog.net/@secretuser/students?referrer-secret=yes",
            "CF-Connecting-IP": "203.0.113.42",
          },
        }),
        async () => {
          console.log("console breadcrumb for secretuser");
          await fetch("https://outbound.example/api?outbound-query-secret=yes");
          captureServerError(new Error("server failure"), { routePattern: "/:username/students" });
          return new Response(null, { status: 500 });
        },
      );

      const payload = sent.join("\n");
      expect(payload).toContain("server failure");
      expect(payload).not.toMatch(/secretuser|secretquery|203\.0\.113\.42|referrer-secret|outbound-query-secret/);
    } finally {
      outboundFetch.mockRestore();
    }
  });
});
