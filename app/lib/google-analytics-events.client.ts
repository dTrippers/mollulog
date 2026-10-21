import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { NAVIGATION_MENU_IDS } from "~/domain/navigation-menu-badges";
import {
  applyGoogleAnalyticsPageContext,
  getGoogleAnalyticsEventPageParameters,
  getGoogleAnalyticsGtag,
  getGoogleAnalyticsLoggedIn,
  initializeGoogleAnalytics,
  isGoogleAnalyticsEnabled,
} from "~/lib/google-analytics.client";

const menuIds = [...NAVIGATION_MENU_IDS, "more"] as const;
const filterKeys = [
  "difficulty",
  "defenseType",
  "defenseTypeSet",
  "sort",
  "terrain",
  "bossUid",
  "liked",
  "onlyUpcoming",
  "school",
  "attackType",
  "role",
  "weaponType",
  "rarity",
  "status",
  "feedType",
  "filter",
  "tab",
  "type",
  "event",
  "page",
  "student",
  "defenseTypeSet",
  "attackTypes",
  "defenseTypes",
  "roles",
  "positions",
  "tacticRoles",
  "schools",
  "equipmentSlots",
  "initialTiers",
  "groupBy",
  "displayBy",
  "auto",
  "autoOnly",
  "exactParties",
  "includeStudents",
  "excludeStudents",
  "filterNotOwned",
  "allowBorrowedStudent",
  "onlyWithParty",
  "includeStudents",
  "excludeStudents",
] as const;

const eventRules = {
  nav_menu_click: { menu_id: menuIds },
  search: {
    scope: ["global", "students", "my_students", "events", "furniture", "resources"],
    result_bucket: ["0", "1-5", "6+"],
  },
  filter_apply: {
    scope: ["raids", "raid_videos", "raid_ranks", "timelines", "community", "students", "coupons", "events"],
    filter: filterKeys,
  },
  share: {
    content_type: ["timeline", "post", "student_growth", "security_campaign"],
    method: ["native", "copy"],
  },
  error_shown: { kind: ["not_found", "server", "other"] },
  web_vitals: { metric: ["LCP", "INP", "CLS"], value: "number", rating: ["good", "needs-improvement", "poor"] },
  login: { method: ["google", "github", "discord", "passkey"] },
  sign_up: { method: ["google", "github", "discord", "passkey"] },
  account_linked: { provider: ["google", "github", "discord"] },
  passkey_registered: {},
  discord_notification_connected: {},
  notification_preference_saved: {},
  account_deleted: {},
  student_state_saved: { source: ["manual", "ocr", "connect_import"], scope: ["single", "bulk"] },
  growth_plan_changed: { action: ["add", "remove", "enroll", "tier", "relationship", "growth"] },
  relationship_saved: { action: ["save", "delete"] },
  resource_inventory_saved: { source: ["manual", "draft"] },
  furniture_inventory_saved: {},
  student_grading_submitted: {},
  student_grading_deleted: {},
  ocr_job_created: { kind: ["student", "resource"], input: ["image", "video"] },
  ocr_job_submitted: { kind: ["student", "resource"], input: ["image", "video"] },
  ocr_job_cancelled: { kind: ["student", "resource"] },
  ocr_job_applied: { target: ["student_state", "item_inventory"] },
  connect_import_submitted: {},
  connect_import_applied: {},
  connect_import_discarded: {},
  connect_export_requested: { format: ["schaledb", "justin163"] },
  event_shop_plan_saved: {},
  recruitment_simulated: { mode: ["ten_pull", "until_target"] },
  minigame_calculated: { game: ["card_flip", "treasure_hunt"] },
  pyroxene_plan_saved: {
    section: [
      "owned_resources",
      "buy",
      "monthly_package",
      "ap_package",
      "attendance",
      "other",
      "event_data",
      "options",
      "source",
      "delete",
    ],
  },
  planner_saved: { action: ["create", "create_package", "update", "save_recruitment"] },
  planner_guest_imported: { target: ["planner", "pyroxene"] },
  ap_plan_saved: {
    action: [
      "save-conditions",
      "add-plan",
      "remove-plan",
      "add-plan-with-access",
      "save-access-time",
      "apply-charge-exception",
      "remove-charge-exception",
    ],
  },
  calculator_used: { tool: ["raidscore", "relationship_item", "ap"] },
  futures_spoiler_toggled: { state: ["revealed", "hidden"] },
  raid_video_opened: { raid_type: ["total_assault", "elimination", "unlimit", "allied", "raid"] },
  coupon_code_copied: { code_type: ["coupon", "member_code"] },
  coupon_marked: { state: ["used", "unused"] },
  community_comment_created: {},
  community_post_liked: {},
  timeline_liked: {},
  content_comment_created: { content_type: ["event", "future"] },
  timeline_created: {},
  timeline_cloned: {},
  contact_submitted: {},
  follow_toggled: { state: ["followed", "unfollowed"] },
  recruitment_result_submitted: {
    action: ["complete", "complete_student", "uncomplete_student", "cancel", "upsert", "delete"],
  },
  api_key_issued: {},
  api_key_revoked: {},
} as const satisfies Record<string, Record<string, readonly string[] | "number" | "boolean">>;

export const GOOGLE_ANALYTICS_EVENT_NAMES = Object.keys(eventRules) as (keyof typeof eventRules)[];
export type GoogleAnalyticsEventName = keyof typeof eventRules;
type EventRules = typeof eventRules;
type RuleValue<Rule> = Rule extends readonly (infer Value extends string)[]
  ? Value
  : Rule extends "number"
    ? number
    : Rule extends "boolean"
      ? boolean
      : never;
export type GoogleAnalyticsEventParameters<Event extends GoogleAnalyticsEventName> = {
  [Key in keyof EventRules[Event]]: RuleValue<EventRules[Event][Key]>;
};
export type AnalyticsAuthMethod = "google" | "github" | "discord" | "passkey";
export type RecruitmentResultAnalyticsAction =
  | "complete"
  | "complete_student"
  | "uncomplete_student"
  | "cancel"
  | "upsert"
  | "delete";
export type PendingAuthEvent = { eventName: "login" | "sign_up"; method: AnalyticsAuthMethod };
type EmptyEventName = {
  [Event in GoogleAnalyticsEventName]: keyof EventRules[Event] extends never ? Event : never;
}[GoogleAnalyticsEventName];
type ParameterizedEventName = Exclude<GoogleAnalyticsEventName, EmptyEventName>;
type TrackArguments =
  | { [Event in EmptyEventName]: [name: Event] }[EmptyEventName]
  | {
      [Event in ParameterizedEventName]: [name: Event, parameters: GoogleAnalyticsEventParameters<Event>];
    }[ParameterizedEventName];

let analyticsPageKey: string | undefined;
let pageEventsSent = new Set<GoogleAnalyticsEventName>();
const PENDING_AUTH_EVENT_KEY = "mollulog.analytics.pending-auth-event";
const PENDING_AUTH_EVENT_MAX_AGE_MS = 10 * 60 * 1000;

export function setGoogleAnalyticsPageKey(pageKey: string) {
  if (analyticsPageKey === pageKey) return;
  analyticsPageKey = pageKey;
  pageEventsSent = new Set();
}

export function getGoogleAnalyticsResultBucket(count: number): "0" | "1-5" | "6+" {
  return count === 0 ? "0" : count <= 5 ? "1-5" : "6+";
}

export function useTrackGoogleAnalyticsSearch(
  search: string | undefined,
  scope: "global" | "students" | "my_students" | "events" | "furniture" | "resources",
  resultCount: number,
) {
  const resultCountRef = useRef(resultCount);
  resultCountRef.current = resultCount;

  useEffect(() => {
    if (!search?.trim()) return;
    const timer = window.setTimeout(() => {
      trackGoogleAnalyticsEvent("search", {
        scope,
        result_bucket: getGoogleAnalyticsResultBucket(resultCountRef.current),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [scope, search]);
}

export function rememberPendingAuthEvent(eventName: PendingAuthEvent["eventName"], method: AnalyticsAuthMethod) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_AUTH_EVENT_KEY, JSON.stringify({ eventName, method, createdAt: Date.now() }));
  } catch {
    // Storage can be disabled; login tracking then remains unavailable for this auth flow.
  }
}

export function consumePendingAuthEvent(): PendingAuthEvent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(PENDING_AUTH_EVENT_KEY);
    window.sessionStorage.removeItem(PENDING_AUTH_EVENT_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as { eventName?: unknown; method?: unknown; createdAt?: unknown };
    if (
      (value.eventName !== "login" && value.eventName !== "sign_up") ||
      (value.method !== "google" &&
        value.method !== "github" &&
        value.method !== "discord" &&
        value.method !== "passkey") ||
      typeof value.createdAt !== "number" ||
      Date.now() - value.createdAt > PENDING_AUTH_EVENT_MAX_AGE_MS
    ) {
      return null;
    }
    return { eventName: value.eventName, method: value.method };
  } catch {
    return null;
  }
}

export function sanitizeGoogleAnalyticsEventParameters(
  eventName: GoogleAnalyticsEventName,
  parameters: unknown,
  loggedIn: boolean,
): Record<string, string | number | boolean> {
  const source = typeof parameters === "object" && parameters !== null ? (parameters as Record<string, unknown>) : {};
  const safe: Record<string, string | number | boolean> = {};
  const rules = eventRules[eventName] as Record<string, readonly string[] | "number" | "boolean">;

  for (const [key, rule] of Object.entries(rules)) {
    const value = source[key];
    if (Array.isArray(rule) && typeof value === "string" && rule.includes(value)) {
      safe[key] = value;
    } else if (rule === "number" && typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (rule === "boolean" && typeof value === "boolean") {
      safe[key] = value;
    }
  }

  safe.logged_in = loggedIn;
  Object.assign(safe, getGoogleAnalyticsEventPageParameters());
  return safe;
}

function getGoogleAnalyticsGtagForEvent() {
  if (!isGoogleAnalyticsEnabled() || !getGoogleAnalyticsEventPageParameters().page_location) return undefined;
  initializeGoogleAnalytics();
  return getGoogleAnalyticsGtag();
}

export function trackGoogleAnalyticsEvent(...args: TrackArguments) {
  const [eventName, parameters] = args as [GoogleAnalyticsEventName, Record<string, unknown>?];
  const gtag = getGoogleAnalyticsGtagForEvent();
  if (!gtag) return false;
  applyGoogleAnalyticsPageContext(gtag);
  gtag("event", eventName, sanitizeGoogleAnalyticsEventParameters(eventName, parameters, getGoogleAnalyticsLoggedIn()));
  return true;
}

export function trackGoogleAnalyticsEventIfAllowed(eventName: unknown, parameters: unknown) {
  if (typeof eventName !== "string" || !Object.hasOwn(eventRules, eventName)) return false;
  const knownEventName = eventName as GoogleAnalyticsEventName;
  const gtag = getGoogleAnalyticsGtagForEvent();
  if (!gtag) return false;
  applyGoogleAnalyticsPageContext(gtag);
  gtag(
    "event",
    knownEventName,
    sanitizeGoogleAnalyticsEventParameters(knownEventName, parameters, getGoogleAnalyticsLoggedIn()),
  );
  return true;
}

const ANALYTICS_EVENTS_COOKIE_NAME = "__mllg_analytics_events";

function consumeGoogleAnalyticsEventsCookie() {
  const prefix = `${ANALYTICS_EVENTS_COOKIE_NAME}=`;
  const value = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
  if (value === undefined) return;

  document.cookie = `${ANALYTICS_EVENTS_COOKIE_NAME}=; Max-Age=0; Path=/`;
  try {
    const events = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!Array.isArray(events)) return;
    for (const event of events) {
      if (typeof event !== "object" || event === null) continue;
      const { eventName, parameters } = event as { eventName?: unknown; parameters?: unknown };
      trackGoogleAnalyticsEventIfAllowed(eventName, parameters);
    }
  } catch {
    // Malformed cookie data is discarded after the cookie is cleared.
  }
}

export function useConsumeGoogleAnalyticsEventCookie() {
  const location = useLocation();
  const lastConsumedLocationKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (lastConsumedLocationKeyRef.current === location.key) return;
    lastConsumedLocationKeyRef.current = location.key;
    if (typeof document !== "undefined") consumeGoogleAnalyticsEventsCookie();
  }, [location.key]);
}

export function trackGoogleAnalyticsEventOncePerPage(...args: TrackArguments) {
  const [eventName] = args;
  if (pageEventsSent.has(eventName)) return;
  if (trackGoogleAnalyticsEvent(...args)) pageEventsSent.add(eventName);
}

export function useTrackCreatedCommentAnalyticsEvent(
  fetcherState: string,
  response: unknown,
  contentType: "event" | "future",
) {
  const trackedResponseRef = useRef<unknown>(null);

  useEffect(() => {
    if (
      fetcherState !== "idle" ||
      typeof response !== "object" ||
      response === null ||
      !("createdComment" in response) ||
      !response.createdComment ||
      response === trackedResponseRef.current
    ) {
      return;
    }

    if (trackGoogleAnalyticsEvent("content_comment_created", { content_type: contentType })) {
      trackedResponseRef.current = response;
    }
  }, [contentType, fetcherState, response]);
}

export function trackRecruitmentResultSubmitted(action: unknown) {
  if (
    action === "complete" ||
    action === "complete_student" ||
    action === "uncomplete_student" ||
    action === "cancel" ||
    action === "upsert" ||
    action === "delete"
  ) {
    trackGoogleAnalyticsEvent("recruitment_result_submitted", { action });
  }
}

export function trackOcrJobApplied(target: "student_state" | "item_inventory", alreadyApplied: boolean) {
  if (!alreadyApplied) trackGoogleAnalyticsEvent("ocr_job_applied", { target });
}

export function trackLikeAdded(target: "community_post" | "timeline", liked: boolean) {
  if (!liked) return;
  if (target === "community_post") trackGoogleAnalyticsEvent("community_post_liked");
  else trackGoogleAnalyticsEvent("timeline_liked");
}

export function trackEventShopPlanSaved(success: boolean) {
  if (success) trackGoogleAnalyticsEventOncePerPage("event_shop_plan_saved");
}
