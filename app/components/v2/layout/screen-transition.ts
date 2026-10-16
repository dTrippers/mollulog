import type { MouseEvent } from "react";
import { flushSync } from "react-dom";

export type V2TransitionKind = "forward" | "reverse" | "crossfade";

export type V2NavigationType = "PUSH" | "REPLACE" | "POP";

export const v2TransitionAttribute = "data-v2-transition";

// The attribute outlives the click. React Router starts a link's view transition only after its loaders resolve, so the
// attribute stays until the navigation commits (V2Page calls commitV2Navigation). After the commit it stays for the settle
// delay, which covers the longest 2.0 transition (forward in, the `slow` token). A navigation that never commits clears at
// the pending fallback, which is long enough for a slow loader to keep its kind.
const settleMs = 400;
const pendingFallbackMs = 30_000;

// "link" and "back" wait for their navigation to commit. "state" clears when its view transition finishes.
type V2TransitionOwner = "link" | "back" | "state";

type ViewTransitionDocument = Pick<Document, "visibilityState"> & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
};

// Each arm gets a token. Every timer and every clear checks it, so a timer from an earlier transition cannot clear a newer kind.
let transitionToken = 0;
let owner: V2TransitionOwner | null = null;
let awaitingCommit = false;
// Set by the v2 back action until its navigation commits. A browser POP without it carries no v2 kind.
let backRequested = false;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

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

// Drops the attribute and every timer of the current transition.
function clearV2Transition(): void {
  transitionToken += 1;
  clearTimeout(clearTimer);
  clearTimer = undefined;
  owner = null;
  awaitingCommit = false;
  backRequested = false;
  clearTransitionKind();
}

// Clears only while the transition that set the token is still the current one.
function clearIfCurrent(token: number): void {
  if (token === transitionToken) {
    clearV2Transition();
  }
}

// Every arm goes through here. It replaces the owner and cancels the timer of any earlier transition, link or state alike.
function armTransition(kind: V2TransitionKind, nextOwner: V2TransitionOwner): number {
  transitionToken += 1;
  clearTimeout(clearTimer);
  owner = nextOwner;
  awaitingCommit = nextOwner !== "state";
  backRequested = false;
  setTransitionKind(kind);
  const token = transitionToken;
  clearTimer = awaitingCommit ? setTimeout(() => clearIfCurrent(token), pendingFallbackMs) : undefined;
  return token;
}

/**
 * Settles a pending link or back kind. It runs when a navigation commits (V2Page) and when V2Page unmounts. The kind clears
 * after the settle delay, measured from the commit rather than from the click, so a slow loader does not cut it short.
 */
export function settleV2LinkTransition(): void {
  if (!awaitingCommit) {
    return;
  }
  awaitingCommit = false;
  clearTimeout(clearTimer);
  const token = transitionToken;
  clearTimer = setTimeout(() => clearIfCurrent(token), settleMs);
}

/**
 * Called on every committed navigation (V2Page). A POP that the v2 back action did not start carries no kind, so a pending
 * link kind is dropped at once rather than animating the POP.
 */
export function commitV2Navigation(navigationType: V2NavigationType): void {
  const fromBack = backRequested;
  backRequested = false;
  if (navigationType === "POP" && !fromBack) {
    if (owner === "link") {
      clearV2Transition();
    }
    return;
  }
  settleV2LinkTransition();
}

/**
 * A browser popstate fires before React Router starts its POP transition. A pending link kind is dropped there unless the
 * v2 back action started this POP.
 */
export function handleV2PopState(): void {
  if (!backRequested && owner === "link") {
    clearV2Transition();
  }
}

/**
 * Props for a React Router `Link` that navigates with a 2.0 transition. Route navigation is async (loaders run before the
 * new route commits), so the link uses React Router's own `viewTransition` and only sets the kind attribute. Without View
 * Transition support the attribute is not set and the navigation is instant.
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
        armTransition(kind, "link");
      }
    },
  };
}

/**
 * The header back action. It arms `reverse` and runs the router navigation, for example `navigate(-1)`. React Router owns
 * the view transition for that navigation, so this never calls startViewTransition. When the router does not transition
 * the navigation, nothing animates, and the kind clears at the commit.
 */
export function runV2BackNavigation(navigateBack: () => void | Promise<void>): void {
  if (canUseV2ViewTransition(getViewTransitionDocument())) {
    armTransition("reverse", "back");
    backRequested = true;
  }
  void navigateBack();
}

/**
 * State-only update (onClick tabs and similar). The DOM update runs synchronously inside the transition callback so the new
 * state is captured. Without View Transition support the update runs at once. This is the only direct startViewTransition
 * call in the layout.
 */
export function runV2StateTransition(kind: V2TransitionKind, update: () => void): void {
  const documentLike = getViewTransitionDocument();
  if (!canUseV2ViewTransition(documentLike)) {
    update();
    return;
  }
  const token = armTransition(kind, "state");
  const transition = documentLike?.startViewTransition?.(() => {
    flushSync(update);
  });
  const finish = () => clearIfCurrent(token);
  if (transition) {
    transition.finished.then(finish, finish);
  } else {
    finish();
  }
}
