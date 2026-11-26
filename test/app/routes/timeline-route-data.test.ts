import { describe, expect, it } from "@jest/globals";
import { isActionValidationError } from "~/lib/action-errors";
import { parseWalkthroughFormData } from "~/routes/timelines._components/timeline-route-data.server";

describe("parseWalkthroughFormData", () => {
  it("refuses a save from a page that predates the body, so the stored body is not emptied", () => {
    const formData = new FormData();
    formData.set("title", "공략");
    formData.set("description", "1.x 설명");
    formData.set("visibility", "private");
    formData.set("isAuto", "false");
    formData.set("document", "{}");
    let caught: unknown;
    try {
      parseWalkthroughFormData(formData);
    } catch (error) {
      caught = error;
    }
    expect(isActionValidationError(caught)).toBe(true);
    expect((caught as Error).message).toBe("페이지를 새로고침한 뒤 다시 저장해 주세요.");
  });
});
