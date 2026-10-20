import { useEffect, useLayoutEffect, useRef } from "react";
import { PageToolbar } from "./PageToolbar";
import { ScreenTabs } from "./ScreenTabs";
import { useScreenNavigationFocus } from "./screen-navigation-focus";
import type { ScreenTabItem } from "./screen-navigation-item";
import { ScreenNavigationItemRenderer } from "./screen-navigation-item";
import { useV2Page } from "./V2Page";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ScreenNavigation({ items }: { items: ScreenTabItem[] }) {
  const focus = useScreenNavigationFocus();
  if (!focus) {
    throw new Error("ScreenNavigation must render inside ScreenNavigationFocusScope.");
  }
  return (
    <nav
      ref={(element) => focus.registerNavigation("vertical", element)}
      aria-label="화면 탐색"
      className="flex flex-col gap-v2-list-gap rounded-lg bg-v2-surface p-2"
      onBlurCapture={focus.onNavigationBlur}
      onFocusCapture={(event) => focus.onNavigationFocus("vertical", event)}
    >
      {items.map((item) => (
        <ScreenNavigationItemRenderer key={item.key} item={item} orientation="vertical" responsiveNavigation />
      ))}
    </nav>
  );
}

export function ScreenNavigationToolbar({ items }: { items: ScreenTabItem[] }) {
  const { stacked } = useV2Page();
  const focus = useScreenNavigationFocus();
  if (!focus) {
    throw new Error("ScreenNavigationToolbar must render inside ScreenNavigationFocusScope.");
  }
  const previousStackedRef = useRef(stacked);

  useIsomorphicLayoutEffect(() => {
    const previousStacked = previousStackedRef.current;
    previousStackedRef.current = stacked;
    if (previousStacked === stacked) {
      return;
    }

    const focusedItem = focus.focusedItemRef.current;
    const previousOrientation = previousStacked ? "horizontal" : "vertical";
    if (!focusedItem || focusedItem.orientation !== previousOrientation) {
      return;
    }

    const nextNavigation = stacked ? focus.horizontalNavigationRef.current : focus.verticalNavigationRef.current;
    const nextItem = [
      ...(nextNavigation?.querySelectorAll<HTMLElement>("[data-v2-screen-navigation-item]") ?? []),
    ].find((item) => item.dataset.v2ScreenNavigationItem === focusedItem.key);
    nextItem?.focus({ preventScroll: true });
  }, [focus, stacked]);

  return <PageToolbar stackedOnly>{stacked ? <ScreenTabs items={items} /> : null}</PageToolbar>;
}
