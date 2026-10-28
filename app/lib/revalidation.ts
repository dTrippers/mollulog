import type { ShouldRevalidateFunctionArgs } from "react-router";

// React Router reruns every loader on the page after any action, including background fetcher submissions such as the
// event shop autosave that posts every 1.5 seconds. These helpers name the submissions whose results some loaders never
// read, so those loaders can skip the extra request.

function getSubmissionPathname(formAction: string | undefined): string | null {
  if (!formAction) {
    return null;
  }
  return new URL(formAction, "http://localhost").pathname;
}

const EVENT_SHOP_STATE_PATH = /^\/api\/events\/[^/]+\/shop-state$/;

export function isEventShopStateSubmission({ formAction }: Pick<ShouldRevalidateFunctionArgs, "formAction">): boolean {
  const pathname = getSubmissionPathname(formAction);
  return pathname !== null && EVENT_SHOP_STATE_PATH.test(pathname);
}

// A plan save only stores the state the page already shows. An owned quantity update goes to the same endpoint but
// changes loader data, so it is not a plan save.
export function isEventShopPlanSaveSubmission({
  formAction,
  json,
}: Pick<ShouldRevalidateFunctionArgs, "formAction" | "json">): boolean {
  return (
    isEventShopStateSubmission({ formAction }) &&
    typeof json === "object" &&
    json !== null &&
    !Array.isArray(json) &&
    "save" in json
  );
}

// Endpoints whose actions never change what the root loader reads: the session, preferences, and the personal
// navigation badges (unconsumed coupons, unread feedback replies and notifications). Anything not listed here,
// including /api/preference and /api/notifications, still revalidates the root.
const ROOT_INDEPENDENT_ACTION_PATHS = [
  EVENT_SHOP_STATE_PATH,
  /^\/api\/community\/posts\/[^/]+\/(likes|comments)$/,
  /^\/api\/timelines\/[^/]+\/likes$/,
  /^\/api\/contents\/[^/]+\/comments$/,
  /^\/api\/contents$/,
  /^\/api\/followerships$/,
  /^\/api\/ask$/,
  /^\/api\/recruitment-results$/,
  /^\/api\/account\/recruitment-opinions$/,
  /^\/api\/ocr\/jobs(\/.*)?$/,
];

export function isRootIndependentSubmission({ formAction }: Pick<ShouldRevalidateFunctionArgs, "formAction">): boolean {
  const pathname = getSubmissionPathname(formAction);
  return pathname !== null && ROOT_INDEPENDENT_ACTION_PATHS.some((pattern) => pattern.test(pathname));
}
