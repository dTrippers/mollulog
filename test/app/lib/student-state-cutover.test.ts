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
  STUDENT_STATE_CUTOVER_MAINTENANCE_KEY,
  STUDENT_STATE_MAINTENANCE_RETRY_AFTER_SECONDS,
} from "~/domain/student-state-cutover";
import {
  isStudentStateMaintenanceResult,
  studentStateMaintenanceActionResult,
} from "~/lib/student-state-cutover.server";

const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedWithTimeout = withTimeout as jest.MockedFunction<typeof withTimeout>;

function createEnv(get: (key: string) => Promise<string | null>) {
  return { KV_CACHE: { get: jest.fn(get) } } as unknown as Env;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedWithTimeout.mockImplementation((promise) => promise);
});

describe("student-state maintenance guard", () => {
  it("allows writes when the key is absent", async () => {
    await expect(studentStateMaintenanceActionResult(createEnv(async () => null))).resolves.toBeNull();
  });

  it("returns the typed 503 result when the key is present", async () => {
    const response = await studentStateMaintenanceActionResult(
      createEnv(async (key) => {
        expect(key).toBe(STUDENT_STATE_CUTOVER_MAINTENANCE_KEY);
        return "enabled";
      }),
    );

    expect(response?.init?.status).toBe(503);
    expect(response?.init?.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": String(STUDENT_STATE_MAINTENANCE_RETRY_AFTER_SECONDS),
      "Cache-Control": "no-store",
    });
    expect(isStudentStateMaintenanceResult(response?.data)).toBe(true);
  });

  it("wraps the KV read in the bounded runtime timeout", async () => {
    const get = jest.fn(async () => null);
    await studentStateMaintenanceActionResult(createEnv(get));

    expect(mockedWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      RUNTIME_TIMEOUTS.kv.operation,
      "student-state-cutover.kv.get",
    );
  });

  it("fails closed and logs when KV read rejects", async () => {
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);

    const response = await studentStateMaintenanceActionResult(
      createEnv(async () => {
        throw new Error("KV unavailable");
      }),
      { operation: "student-state.test" },
    );

    expect(response?.init?.status).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      "Student-state maintenance KV read failed; failing closed",
      expect.any(Error),
      expect.objectContaining({ key: STUDENT_STATE_CUTOVER_MAINTENANCE_KEY, operation: "student-state.test" }),
    );
  });

  it("fails closed when the bounded KV read times out", async () => {
    mockedWithTimeout.mockRejectedValueOnce(new Error("timeout"));
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);

    const response = await studentStateMaintenanceActionResult(
      createEnv(async () => new Promise<string | null>(() => {})),
      { operation: "student-state.timeout" },
    );

    expect(response?.init?.status).toBe(503);
    expect(logger.error).toHaveBeenCalled();
  });
});
