import { describe, expect, it } from "@jest/globals";
import { isServerRouteError, normalizeRouteError } from "../../../app/lib/route-error";

function routeErrorResponse(status: number, data: unknown) {
  return {
    status,
    statusText: "",
    internal: false,
    data,
  };
}

describe("normalizeRouteError", () => {
  it("normalizes a raw Response without exposing its body", () => {
    const normalized = normalizeRouteError(new Response("Not Found", { status: 404 }));

    expect(normalized).toMatchObject({
      status: 404,
      title: "페이지를 찾을 수 없어요",
      message: "주소가 올바른지 확인해주세요.",
    });
  });

  it("keeps structured public error messages and codes", () => {
    const normalized = normalizeRouteError(
      routeErrorResponse(404, {
        error: {
          code: "student.not_found",
          message: "학생 정보를 찾을 수 없어요",
        },
      }),
    );

    expect(normalized).toMatchObject({
      status: 404,
      code: "student.not_found",
      message: "학생 정보를 찾을 수 없어요",
    });
  });

  it("handles legacy string error payloads", () => {
    const normalized = normalizeRouteError(routeErrorResponse(400, { error: "재화 정보가 필요해요" }));

    expect(normalized).toMatchObject({
      status: 400,
      message: "재화 정보가 필요해요",
    });
  });

  it("does not expose internal Error messages", () => {
    const normalized = normalizeRouteError(new Error("D1_ERROR: no such table: secrets"));

    expect(normalized.status).toBe(500);
    expect(normalized.message).toBe("잠시 후 다시 시도해주세요.");
    expect(normalized.message).not.toContain("D1_ERROR");
    expect(normalized.message).not.toContain("secrets");
  });

  it("falls back for malformed route error payloads", () => {
    const normalized = normalizeRouteError(routeErrorResponse(500, { error: { message: "internal stack trace" } }));

    expect(normalized.status).toBe(500);
    expect(normalized.message).toBe("잠시 후 다시 시도해주세요.");
  });

  it("classifies only 5xx errors as server errors", () => {
    expect(isServerRouteError(normalizeRouteError(routeErrorResponse(404, { error: "not found" })))).toBe(false);
    expect(isServerRouteError(normalizeRouteError(routeErrorResponse(500, { error: "failed" })))).toBe(true);
  });
});
