import { describe, expect, it } from "@jest/globals";
import type { LoaderFunctionArgs } from "react-router";
import { loader } from "~/routes/raids.$raidType";

function loaderArgs(params: { raidType?: string; seasonIndex?: string }): LoaderFunctionArgs {
  return { params, request: new Request("https://mollulog.net/raids"), context: {} } as unknown as LoaderFunctionArgs;
}

async function redirectTarget(params: { raidType?: string; seasonIndex?: string }) {
  const response = await loader(loaderArgs(params));
  if (!(response instanceof Response)) throw new Error("Expected a redirect response");
  return { status: response.status, location: response.headers.get("Location") };
}

describe("raid type layout loader", () => {
  it("sends a bare raid type path to the raid list", async () => {
    await expect(redirectTarget({ raidType: "grand-assault" })).resolves.toEqual({ status: 302, location: "/raids" });
    await expect(redirectTarget({ raidType: "total_assault" })).resolves.toEqual({ status: 302, location: "/raids" });
  });

  it("lets a season path through to its child route", async () => {
    await expect(loader(loaderArgs({ raidType: "grand-assault", seasonIndex: "36" }))).resolves.toBeNull();
  });

  it("moves an old raid type name in a season path to the dash format", async () => {
    await expect(redirectTarget({ raidType: "total_assault", seasonIndex: "80" })).resolves.toEqual({
      status: 301,
      location: "/raids/total-assault/80",
    });
  });

  it("keeps an unknown raid type a 404", async () => {
    await expect(loader(loaderArgs({ raidType: "unknown" }))).rejects.toMatchObject({ init: { status: 404 } });
  });
});
