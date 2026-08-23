import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getLogger } from "~/lib/observability.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({ error: jest.fn() })),
}));
jest.mock("~/lib/with-timeout", () => ({
  withTimeout: jest.fn((promise: Promise<unknown>) => promise),
}));

import {
  IDENTITY_CUTOVER_MAINTENANCE_KEY,
  IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS,
  identityMaintenanceMessage,
  identityMaintenanceResult,
} from "~/domain/identity-cutover";
import {
  identityMaintenanceActionResult,
  identityMaintenancePageResult,
  isIdentityMaintenanceResult,
} from "~/lib/identity-cutover.server";

const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedWithTimeout = withTimeout as jest.MockedFunction<typeof withTimeout>;

function createEnv(get: (key: string) => Promise<string | null>) {
  return { KV_CACHE: { get: jest.fn(get) } } as unknown as Env;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedWithTimeout.mockImplementation((promise) => promise);
});

describe("identity maintenance guard", () => {
  it("maps only the typed maintenance payload to the shared user notice", () => {
    expect(identityMaintenanceMessage(identityMaintenanceResult)).toBe(identityMaintenanceResult.message);
    expect(identityMaintenanceMessage({ error: "database connection failed" })).toBeNull();
  });

  it("allows identity writes when maintenance is absent", async () => {
    await expect(identityMaintenanceActionResult(createEnv(async () => null))).resolves.toBeNull();
  });

  it("returns a typed 503 with retry and no-store headers when enabled", async () => {
    const response = await identityMaintenanceActionResult(
      createEnv(async (key) => {
        expect(key).toBe(IDENTITY_CUTOVER_MAINTENANCE_KEY);
        return "enabled";
      }),
    );

    expect(response?.init?.status).toBe(503);
    expect(response?.init?.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    });
    expect(isIdentityMaintenanceResult(response?.data)).toBe(true);
    expect((response?.data as { message: string }).message).toContain("잠시");
  });

  it("returns Korean HTML instead of raw JSON for OAuth callback maintenance", async () => {
    const response = await identityMaintenancePageResult(
      createEnv(async () => "enabled"),
      { operation: "auth.google.callback" },
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get("Content-Type")).toContain("text/html");
    expect(response?.headers.get("Retry-After")).toBe(String(IDENTITY_MAINTENANCE_RETRY_AFTER_SECONDS));
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    const body = await response?.text();
    expect(body).toContain("잠시 점검 중이에요");
    expect(body).toContain(identityMaintenanceResult.message);
    expect(body).not.toContain('"kind":"identityMaintenance"');
  });

  it("bounds the KV read with the standard operation timeout", async () => {
    await identityMaintenanceActionResult(createEnv(async () => null));
    expect(mockedWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      RUNTIME_TIMEOUTS.kv.operation,
      "identity-cutover.kv.get",
    );
  });

  it("fails closed and logs a KV error", async () => {
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);
    const response = await identityMaintenanceActionResult(
      createEnv(async () => {
        throw new Error("KV unavailable");
      }),
      { operation: "identity-cutover.test" },
    );

    expect(response?.init?.status).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      "Identity maintenance KV read failed; failing closed",
      expect.any(Error),
      expect.objectContaining({ key: IDENTITY_CUTOVER_MAINTENANCE_KEY, operation: "identity-cutover.test" }),
    );
  });

  it("fails closed when the bounded KV read times out", async () => {
    mockedWithTimeout.mockRejectedValueOnce(new Error("timeout"));
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);
    const response = await identityMaintenanceActionResult(
      createEnv(async () => new Promise<string | null>(() => {})),
      { operation: "identity-cutover.timeout" },
    );

    expect(response?.init?.status).toBe(503);
    expect(logger.error).toHaveBeenCalled();
  });
});
