import { describe, expect, it } from "@jest/globals";
import {
  isEventShopPlanSaveSubmission,
  isEventShopStateSubmission,
  isRootIndependentSubmission,
} from "~/lib/revalidation";

const shopUrl = new URL("https://mollulog.test/events/event-1/shop");
const samePage = { currentUrl: shopUrl, nextUrl: shopUrl };
// A fetcher submission that completes while a navigation to another event is still loading.
const duringNavigation = { currentUrl: shopUrl, nextUrl: new URL("https://mollulog.test/events/event-2/shop") };

describe("revalidation submissions", () => {
  it("recognizes the event shop state endpoint", () => {
    expect(isEventShopStateSubmission({ ...samePage, formAction: "/api/events/event-1/shop-state" })).toBe(true);
    expect(isEventShopStateSubmission({ ...samePage, formAction: "/api/events/event-1/shop-state?index" })).toBe(true);
    expect(isEventShopStateSubmission({ ...samePage, formAction: "/api/events/event-1" })).toBe(false);
    expect(isEventShopStateSubmission({ ...samePage, formAction: undefined })).toBe(false);
  });

  it("treats only a plan save as a plan save, not an owned quantity update", () => {
    const formAction = "/api/events/event-1/shop-state";
    expect(
      isEventShopPlanSaveSubmission({ ...samePage, formAction, json: { save: {}, base: {}, requestId: "r1" } }),
    ).toBe(true);
    expect(
      isEventShopPlanSaveSubmission({ ...samePage, formAction, json: { updateOwnedQuantities: { gem: 3 } } }),
    ).toBe(false);
    expect(isEventShopPlanSaveSubmission({ ...samePage, formAction, json: undefined })).toBe(false);
    expect(isEventShopPlanSaveSubmission({ ...samePage, formAction: "/api/contents", json: { save: {} } })).toBe(false);
  });

  it("skips the root loader only for endpoints that cannot change root data", () => {
    expect(isRootIndependentSubmission({ ...samePage, formAction: "/api/events/event-1/shop-state" })).toBe(true);
    expect(isRootIndependentSubmission({ ...samePage, formAction: "/api/community/posts/post-1/likes" })).toBe(true);
    expect(isRootIndependentSubmission({ ...samePage, formAction: "/api/ocr/jobs/job-1/apply" })).toBe(true);

    expect(isRootIndependentSubmission({ ...samePage, formAction: "/api/preference" })).toBe(false);
    expect(isRootIndependentSubmission({ ...samePage, formAction: "/api/notifications" })).toBe(false);
    expect(isRootIndependentSubmission({ ...samePage, formAction: "/coupons" })).toBe(false);
    expect(isRootIndependentSubmission({ ...samePage, formAction: undefined })).toBe(false);
  });

  it("does not skip a submission that completes while the page is navigating elsewhere", () => {
    const formAction = "/api/events/event-1/shop-state";
    expect(isEventShopStateSubmission({ ...duringNavigation, formAction })).toBe(false);
    expect(isEventShopPlanSaveSubmission({ ...duringNavigation, formAction, json: { save: {} } })).toBe(false);
    expect(isRootIndependentSubmission({ ...duringNavigation, formAction })).toBe(false);
    expect(
      isRootIndependentSubmission({
        currentUrl: shopUrl,
        nextUrl: new URL("https://mollulog.test/events/event-1/shop?tab=cards"),
        formAction,
      }),
    ).toBe(false);
  });
});
