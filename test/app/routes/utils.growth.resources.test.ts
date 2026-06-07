import { describe, expect, it } from "@jest/globals";
import { action, loader } from "../../../app/routes/utils.growth.resources";

describe("utils.growth.resources route", () => {
  it("redirects loader requests to the canonical resource inventory route", async () => {
    const response = await loader({
      request: new Request("https://mollulog.net/utils/growth/resources?tab=equipment"),
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/utils/resources/inventory?tab=equipment");
  });

  it("redirects action requests to the canonical resource inventory route", async () => {
    const response = await action({
      request: new Request("https://mollulog.net/utils/growth/resources", { method: "POST" }),
    } as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/utils/resources/inventory");
  });
});
