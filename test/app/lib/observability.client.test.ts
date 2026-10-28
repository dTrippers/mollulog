/** @jest-environment jsdom */
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("~/lib/observability-sentry.client", () => ({
  initializeSentry: jest.fn(),
  captureClientErrorWithSentry: jest.fn(),
  captureEarlyGlobalError: jest.fn(),
}));

import { captureClientError, isObservabilityChunkError } from "~/lib/observability.client";

const sentryChunkError = new TypeError(
  "Failed to fetch dynamically imported module: https://mollulog.net/assets/observability-sentry.client-BBtqjUZW.js",
);
const chartChunkError = new TypeError(
  "Failed to fetch dynamically imported module: https://mollulog.net/assets/RaidChart-Ab12Cd34.js",
);
const unnamedChunkError = new TypeError("Importing a module script failed.");

describe("observability chunk errors", () => {
  it("recognizes the Sentry chunk by name and nothing else while Sentry is idle", () => {
    expect(isObservabilityChunkError(sentryChunkError)).toBe(true);
    expect(isObservabilityChunkError(chartChunkError)).toBe(false);
    expect(isObservabilityChunkError(unnamedChunkError)).toBe(false);
    expect(isObservabilityChunkError(undefined)).toBe(false);
  });

  it("keeps other chunks' failures recoverable while the Sentry import is in flight", async () => {
    document.head.innerHTML = '<meta name="mollulog:front-sentry-dsn" content="https://key@sentry.example/1">';
    captureClientError(new Error("boom"));

    expect(isObservabilityChunkError(chartChunkError)).toBe(false);
    expect(isObservabilityChunkError(sentryChunkError)).toBe(true);
    // A failure without a module URL is taken to be the Sentry import only while it is loading.
    expect(isObservabilityChunkError(unnamedChunkError)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isObservabilityChunkError(unnamedChunkError)).toBe(false);
  });
});
