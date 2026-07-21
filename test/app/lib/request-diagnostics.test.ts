import { describe, expect, it } from "@jest/globals";
import { createRequestDiagnostics } from "~/lib/request-diagnostics";

describe("createRequestDiagnostics", () => {
  it("captures the request correlation identifiers without the query string", () => {
    const request = new Request("https://mollulog.net/futures?from=search", {
      headers: {
        "cf-ray": "ray-id",
        "x-amz-cf-id": "cloudfront-request-id",
      },
    });

    expect(createRequestDiagnostics(request, "build-id", "render-id")).toEqual({
      renderId: "render-id",
      requestPath: "/futures",
      cloudFrontRequestId: "cloudfront-request-id",
      cloudflareRayId: "ray-id",
      buildId: "build-id",
    });
  });
});
