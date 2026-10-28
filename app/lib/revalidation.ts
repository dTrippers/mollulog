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

type SubmissionArgs = Pick<ShouldRevalidateFunctionArgs, "formAction" | "currentUrl" | "nextUrl">;

// A submission that finishes while a navigation is pending revalidates for the navigation's destination, and that
// revalidation replaces the navigation's own loads. Skipping it there would leave the new page with the old page's data,
// so a submission is only skipped when the page stays where it is.
function staysOnPage({ currentUrl, nextUrl }: Pick<ShouldRevalidateFunctionArgs, "currentUrl" | "nextUrl">): boolean {
  return currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search;
}

const EVENT_SHOP_STATE_PATH = /^\/api\/events\/[^/]+\/shop-state$/;

export function isEventShopStateSubmission(args: SubmissionArgs): boolean {
  const pathname = getSubmissionPathname(args.formAction);
  return pathname !== null && EVENT_SHOP_STATE_PATH.test(pathname) && staysOnPage(args);
}

// A plan save only stores the state the page already shows. An owned quantity update goes to the same endpoint but
// changes loader data, so it is not a plan save.
export function isEventShopPlanSaveSubmission(
  args: SubmissionArgs & Pick<ShouldRevalidateFunctionArgs, "json">,
): boolean {
  const { json } = args;
  return (
    isEventShopStateSubmission(args) &&
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

export function isRootIndependentSubmission(args: SubmissionArgs): boolean {
  const pathname = getSubmissionPathname(args.formAction);
  return (
    pathname !== null && ROOT_INDEPENDENT_ACTION_PATHS.some((pattern) => pattern.test(pathname)) && staysOnPage(args)
  );
}
