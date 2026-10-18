import {
  createContext,
  type FocusEvent,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

type NavigationOrientation = "horizontal" | "vertical";
type FocusedNavigationItem = { key: string; orientation: NavigationOrientation };

type ScreenNavigationFocusValue = {
  focusedItemRef: MutableRefObject<FocusedNavigationItem | null>;
  horizontalNavigationRef: MutableRefObject<HTMLElement | null>;
  verticalNavigationRef: MutableRefObject<HTMLElement | null>;
  onNavigationBlur: (event: FocusEvent<HTMLElement>) => void;
  onNavigationFocus: (orientation: NavigationOrientation, event: FocusEvent<HTMLElement>) => void;
  registerNavigation: (orientation: NavigationOrientation, element: HTMLElement | null) => void;
};

const ScreenNavigationFocusContext = createContext<ScreenNavigationFocusValue | null>(null);

function isNavigationHiddenByLayout(navigation: HTMLElement): boolean {
  if (!navigation.isConnected) {
    return true;
  }
  let element: HTMLElement | null = navigation;
  while (element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

export function ScreenNavigationFocusScope({ children }: { children: ReactNode }) {
  const focusedItemRef = useRef<FocusedNavigationItem | null>(null);
  const horizontalNavigationRef = useRef<HTMLElement | null>(null);
  const verticalNavigationRef = useRef<HTMLElement | null>(null);

  const registerNavigation = useCallback((orientation: NavigationOrientation, element: HTMLElement | null) => {
    if (orientation === "horizontal") {
      horizontalNavigationRef.current = element;
    } else {
      verticalNavigationRef.current = element;
    }
  }, []);

  const onNavigationFocus = useCallback((orientation: NavigationOrientation, event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const item = target.closest<HTMLElement>("[data-v2-screen-navigation-item]");
    const key = item?.dataset.v2ScreenNavigationItem;
    if (key) {
      focusedItemRef.current = { key, orientation };
    }
  }, []);

  const onNavigationBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (
      next instanceof Node &&
      (horizontalNavigationRef.current?.contains(next) || verticalNavigationRef.current?.contains(next))
    ) {
      return;
    }
    if (next instanceof Node && next !== document.body && next !== document.documentElement) {
      focusedItemRef.current = null;
      return;
    }
    // A responsive mode change can hide or remove the focused item without identifying its successor.
    if (isNavigationHiddenByLayout(event.currentTarget)) {
      return;
    }
    focusedItemRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      focusedItemRef,
      horizontalNavigationRef,
      verticalNavigationRef,
      onNavigationBlur,
      onNavigationFocus,
      registerNavigation,
    }),
    [onNavigationBlur, onNavigationFocus, registerNavigation],
  );

  return <ScreenNavigationFocusContext.Provider value={value}>{children}</ScreenNavigationFocusContext.Provider>;
}

export function useScreenNavigationFocus(): ScreenNavigationFocusValue | null {
  return useContext(ScreenNavigationFocusContext);
}
