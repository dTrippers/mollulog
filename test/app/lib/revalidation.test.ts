import { describe, expect, it } from "@jest/globals";
import {
  isEventShopPlanSaveSubmission,
  isEventShopStateSubmission,
  isRootIndependentSubmission,
} from "~/lib/revalidation";

describe("revalidation submissions", () => {
  it("recognizes the event shop state endpoint", () => {
    expect(isEventShopStateSubmission({ formAction: "/api/events/event-1/shop-state" })).toBe(true);
    expect(isEventShopStateSubmission({ formAction: "/api/events/event-1/shop-state?index" })).toBe(true);
    expect(isEventShopStateSubmission({ formAction: "/api/events/event-1" })).toBe(false);
    expect(isEventShopStateSubmission({ formAction: undefined })).toBe(false);
  });

  it("treats only a plan save as a plan save, not an owned quantity update", () => {
    const formAction = "/api/events/event-1/shop-state";
    expect(isEventShopPlanSaveSubmission({ formAction, json: { save: {}, base: {}, requestId: "r1" } })).toBe(true);
    expect(isEventShopPlanSaveSubmission({ formAction, json: { updateOwnedQuantities: { gem: 3 } } })).toBe(false);
    expect(isEventShopPlanSaveSubmission({ formAction, json: undefined })).toBe(false);
    expect(isEventShopPlanSaveSubmission({ formAction: "/api/contents", json: { save: {} } })).toBe(false);
  });

  it("skips the root loader only for endpoints that cannot change root data", () => {
    expect(isRootIndependentSubmission({ formAction: "/api/events/event-1/shop-state" })).toBe(true);
    expect(isRootIndependentSubmission({ formAction: "/api/community/posts/post-1/likes" })).toBe(true);
    expect(isRootIndependentSubmission({ formAction: "/api/ocr/jobs/job-1/apply" })).toBe(true);

    expect(isRootIndependentSubmission({ formAction: "/api/preference" })).toBe(false);
    expect(isRootIndependentSubmission({ formAction: "/api/notifications" })).toBe(false);
    expect(isRootIndependentSubmission({ formAction: "/coupons" })).toBe(false);
    expect(isRootIndependentSubmission({ formAction: undefined })).toBe(false);
  });
});
