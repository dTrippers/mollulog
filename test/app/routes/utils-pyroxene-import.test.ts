import { describe, expect, it } from "@jest/globals";
import { loader } from "~/routes/utils.pyroxene_.import";

describe("legacy pyroxene import route", () => {
  it("redirects to the unified import page and preserves other query values", async () => {
    const response = await loader({
      request: new Request("https://mollulog.test/utils/pyroxene/import?event=timeline-1"),
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/planner/import?event=timeline-1&from=pyroxene");
  });
});
