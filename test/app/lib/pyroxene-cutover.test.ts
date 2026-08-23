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
  D1_CUTOVER_MAINTENANCE_KEY,
  D1_MAINTENANCE_RETRY_AFTER_SECONDS,
  d1MaintenanceMessage,
  d1MaintenanceResult,
} from "~/domain/pyroxene-cutover";
import { d1MaintenanceActionResult, isD1MaintenanceResult } from "~/lib/pyroxene-cutover.server";

const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedWithTimeout = withTimeout as jest.MockedFunction<typeof withTimeout>;

function createEnv(get: (key: string) => Promise<string | null>) {
  return { KV_CACHE: { get: jest.fn(get) } } as unknown as Env;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedWithTimeout.mockImplementation((promise) => promise);
});

describe("D1 maintenance guard", () => {
  it("maps only the typed maintenance payload to the shared user notice", () => {
    expect(d1MaintenanceMessage(d1MaintenanceResult)).toBe(d1MaintenanceResult.message);
    expect(d1MaintenanceMessage({ error: "database connection failed" })).toBeNull();
  });

  it("allows guarded writes when maintenance is absent", async () => {
    await expect(d1MaintenanceActionResult(createEnv(async () => null))).resolves.toBeNull();
  });

  it("returns a typed 503 with retry and no-store headers when enabled", async () => {
    const response = await d1MaintenanceActionResult(
      createEnv(async (key) => {
        expect(key).toBe(D1_CUTOVER_MAINTENANCE_KEY);
        return "enabled";
      }),
    );

    expect(response?.init?.status).toBe(503);
    expect(response?.init?.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(D1_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    });
    expect(isD1MaintenanceResult(response?.data)).toBe(true);
    expect((response?.data as { message: string }).message).toContain("잠시");
  });

  it("treats explicit false values as unfrozen", async () => {
    await expect(d1MaintenanceActionResult(createEnv(async () => "false"))).resolves.toBeNull();
    await expect(d1MaintenanceActionResult(createEnv(async () => "0"))).resolves.toBeNull();
    await expect(d1MaintenanceActionResult(createEnv(async () => "  "))).resolves.toBeNull();
  });

  it("bounds the KV read with the standard operation timeout", async () => {
    await d1MaintenanceActionResult(createEnv(async () => null));
    expect(mockedWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      RUNTIME_TIMEOUTS.kv.operation,
      "d1-cutover.kv.get",
    );
  });

  it("fails closed and logs a KV error", async () => {
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);
    const response = await d1MaintenanceActionResult(
      createEnv(async () => {
        throw new Error("KV unavailable");
      }),
      { operation: "utils.pyroxene.action" },
    );

    expect(response?.init?.status).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      "D1 maintenance KV read failed; failing closed",
      expect.any(Error),
      expect.objectContaining({ key: D1_CUTOVER_MAINTENANCE_KEY, operation: "utils.pyroxene.action" }),
    );
  });

  it("fails closed when the bounded KV read times out", async () => {
    mockedWithTimeout.mockRejectedValueOnce(new Error("timeout"));
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);
    const response = await d1MaintenanceActionResult(
      createEnv(async () => new Promise<string | null>(() => {})),
      { operation: "utils.pyroxene.timeout" },
    );

    expect(response?.init?.status).toBe(503);
    expect(logger.error).toHaveBeenCalled();
  });
});
