import type { MouseEvent } from "react";
import { flushSync } from "react-dom";

export type V2TransitionKind = "forward" | "reverse" | "crossfade";

export const v2TransitionAttribute = "data-v2-transition";

// React Router starts a link's view transition only after its loaders resolve, so the attribute stays until the
// navigation commits (V2Page calls settleV2LinkTransition). After the commit it stays for the settle delay, which covers
// the longest 2.0 transition (forward in, the `slow` token). A navigation that never commits falls back to the safety timer.
const linkTransitionSettleMs = 400;
const linkTransitionFallbackMs = 10_000;

type ViewTransitionDocument = Pick<Document, "visibilityState"> & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
};

let linkTransitionPending = false;
let linkTransitionFallbackTimer: ReturnType<typeof setTimeout> | undefined;
let linkTransitionSettleTimer: ReturnType<typeof setTimeout> | undefined;

function getViewTransitionDocument(): ViewTransitionDocument | null {
  return typeof document === "undefined" ? null : document;
}

export function canUseV2ViewTransition(documentLike: ViewTransitionDocument | null): boolean {
  return Boolean(
    documentLike && documentLike.visibilityState !== "hidden" && typeof documentLike.startViewTransition === "function",
  );
}

function setTransitionKind(kind: V2TransitionKind): void {
  document.documentElement.setAttribute(v2TransitionAttribute, kind);
}

function clearTransitionKind(): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.removeAttribute(v2TransitionAttribute);
}

// A link click sets the kind and waits for its navigation. A newer click replaces the pending kind and restarts the timers.
function armLinkTransition(kind: V2TransitionKind): void {
  linkTransitionPending = true;
  clearTimeout(linkTransitionFallbackTimer);
  clearTimeout(linkTransitionSettleTimer);
  setTransitionKind(kind);
  linkTransitionFallbackTimer = setTimeout(() => {
    linkTransitionPending = false;
    clearTransitionKind();
  }, linkTransitionFallbackMs);
}

/**
 * Called when a navigation commits (V2Page). A pending link transition clears after the settle delay, measured from the
 * commit rather than from the click, so a slow loader does not cut the transition short.
 */
export function settleV2LinkTransition(): void {
  if (!linkTransitionPending) {
    return;
  }
  linkTransitionPending = false;
  clearTimeout(linkTransitionFallbackTimer);
  clearTimeout(linkTransitionSettleTimer);
  linkTransitionSettleTimer = setTimeout(clearTransitionKind, linkTransitionSettleMs);
}

/**
 * Props for a React Router `Link` that navigates with a 2.0 transition. Route navigation is async (loaders run
 * before the new route commits), so the link uses React Router's own `viewTransition` and only sets the kind attribute.
 * Without View Transition support the attribute is not set and the navigation is instant.
 */
export function getV2LinkTransitionProps(kind: V2TransitionKind | undefined, onClick?: () => void) {
  if (!kind) {
    return { onClick: onClick ? (_event: MouseEvent<HTMLAnchorElement>) => onClick() : undefined };
  }
  return {
    viewTransition: true,
    onClick: (_event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.();
      if (canUseV2ViewTransition(getViewTransitionDocument())) {
        armLinkTransition(kind);
      }
    },
  };
}

/**
 * State-only update (onClick tabs and similar). The DOM update runs synchronously inside the transition callback so
 * the new state is captured. Without View Transition support the update runs at once.
 */
export function runV2StateTransition(kind: V2TransitionKind, update: () => void): void {
  const documentLike = getViewTransitionDocument();
  if (!canUseV2ViewTransition(documentLike)) {
    update();
    return;
  }
  setTransitionKind(kind);
  const transition = documentLike?.startViewTransition?.(() => {
    flushSync(update);
  });
  transition?.finished.then(clearTransitionKind, clearTransitionKind);
}

/**
 * Reverse navigation that is not a plain link (for example a back button calling `navigate(-1)`). Follows the 1.x
 * `navigateBackWithViewTransition` pattern: the transition callback waits for the action before the snapshot ends.
 */
export async function runV2ReverseTransition(action: () => void | Promise<void>): Promise<void> {
  const documentLike = getViewTransitionDocument();
  if (!canUseV2ViewTransition(documentLike)) {
    await action();
    return;
  }

  setTransitionKind("reverse");
  let actionStarted = false;
  let actionPromise: Promise<void> | undefined;
  try {
    const transition = documentLike?.startViewTransition?.(() => {
      actionStarted = true;
      actionPromise = Promise.resolve(action());
      return actionPromise;
    });
    await actionPromise;
    await transition?.finished;
  } catch (error) {
    if (actionStarted) {
      throw error;
    }
    await action();
  } finally {
    clearTransitionKind();
  }
}
