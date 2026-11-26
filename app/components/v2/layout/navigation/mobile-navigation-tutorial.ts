import { useEffect, useState } from "react";
import { useLocation } from "react-router";

export const mobileNavigationTutorialStorageKey = "navigation::seen-mobile-tab-personalization-v1";

// The 하단 탭 고정 section on /more, where the bottom-tab hint's 바꾸기 leads.
export const mobileNavigationSettingsAnchorId = "mobile-navigation-settings";
export const mobileNavigationSettingsPath = `/more#${mobileNavigationSettingsAnchorId}`;

// Counts arrivals at the 하단 탭 고정 section through its link, so the section and the pinned bottom tabs can play
// their highlight once per arrival (keyed by the count). It is 0 on the server render and the first client render, so
// hydration matches.
export function useMobileNavigationSettingsArrival(): number {
  const location = useLocation();
  const [arrivals, setArrivals] = useState(0);
  const arrived = location.pathname === "/more" && location.hash === `#${mobileNavigationSettingsAnchorId}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new location key is a new arrival
  useEffect(() => {
    if (arrived) {
      setArrivals((count) => count + 1);
    }
  }, [arrived, location.key]);
  return arrivals;
}
