import { useCallback, useEffect, useRef, useState } from "react";
import type { StudentDirectoryFilterState } from "~/domain/student-directory";
import { trackGoogleAnalyticsEventIfAllowed } from "~/lib/google-analytics-events.client";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import {
  normalizeStudentDirectoryFilterState,
  serializeStudentDirectoryFilterStateCookie,
  writeStudentDirectoryFilterStateCookie,
} from "./student-directory-cookie";

export function useStudentDirectoryFilterState(
  cookieName: string,
  initialState: StudentDirectoryFilterState,
  students: StudentDirectoryStudent[],
  loaded: boolean,
) {
  const [state, setState] = useState(() => normalizeStudentDirectoryFilterState(initialState, students));
  const stateRef = useRef(state);
  const serializedRef = useRef(serializeStudentDirectoryFilterStateCookie(state, students));
  const wasLoadedRef = useRef(loaded);
  useEffect(() => {
    if (wasLoadedRef.current || !loaded) return;
    wasLoadedRef.current = true;
    const normalized = normalizeStudentDirectoryFilterState(initialState, students);
    stateRef.current = normalized;
    serializedRef.current = serializeStudentDirectoryFilterStateCookie(normalized, students);
    setState(normalized);
  }, [initialState, loaded, students]);
  const setPersistentState = useCallback(
    (updater: React.SetStateAction<StudentDirectoryFilterState>) => {
      const next = typeof updater === "function" ? updater(stateRef.current) : updater;
      trackStudentDirectoryFilterChanges(stateRef.current, next);
      stateRef.current = next;
      const serialized = serializeStudentDirectoryFilterStateCookie(next, students);
      if (serialized && serialized !== serializedRef.current) {
        writeStudentDirectoryFilterStateCookie(cookieName, next, students);
        serializedRef.current = serialized;
      }
      setState(next);
    },
    [cookieName, students],
  );
  return [state, setPersistentState] as const;
}

// Analytics filter names for the directory state. Keys without a catalog name are not reported.
const analyticsFilterNames = {
  attackTypes: "attackTypes",
  defenseTypes: "defenseTypes",
  classes: "roles",
  roles: "tacticRoles",
  positions: "positions",
  schools: "schools",
  terrain: "terrain",
  initialTiers: "initialTiers",
  equipmentSlots: "equipmentSlots",
  sort: "sort",
  displayBy: "displayBy",
  groupBy: "groupBy",
} as const satisfies Partial<Record<keyof StudentDirectoryFilterState, string>>;

function trackStudentDirectoryFilterChanges(previous: StudentDirectoryFilterState, next: StudentDirectoryFilterState) {
  for (const [key, filter] of Object.entries(analyticsFilterNames) as [keyof typeof analyticsFilterNames, string][]) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      trackGoogleAnalyticsEventIfAllowed("filter_apply", { scope: "students", filter });
    }
  }
}
