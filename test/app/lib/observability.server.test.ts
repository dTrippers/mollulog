import { describe, expect, it } from "@jest/globals";
import * as Sentry from "@sentry/cloudflare";
import { captureServerError, createServerSentryOptions, scrubServerSentryEvent } from "~/lib/observability.server";

describe("server Sentry options", () => {
  it("never sends request credentials in a captured worker error event", async () => {
    const sent: string[] = [];
    const token = `mllg_${"a".repeat(64)}`;
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
      {
        async fetch() {
          captureServerError(new Error("hyperdrive connection reset"), { handler: "test" });
          return new Response(null, { status: 503 });
        },
      },
    );
    const waits: Promise<unknown>[] = [];
    const response = await handler.fetch?.(
      new Request("https://api.mollulog.net/v1/me/students", {
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: "__session=session-secret",
          "User-Agent": "sync-agent",
        },
      }) as unknown as Parameters<NonNullable<typeof handler.fetch>>[0],
      { SERVER_SENTRY_DSN: "https://public@o0.ingest.sentry.io/0", STAGE: "test" } as unknown as Env,
      { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException: () => {} } as never,
    );
    expect(response?.status).toBe(503);
    await Promise.all(waits);
    await Sentry.flush(2_000);

    const payload = sent.join("\n");
    expect(payload).toContain("hyperdrive connection reset");
    expect(payload).toContain("sync-agent");
    expect(payload).not.toContain(token);
    expect(payload).not.toContain("session-secret");
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
});
