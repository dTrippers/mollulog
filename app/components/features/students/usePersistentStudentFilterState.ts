import { useCallback, useMemo, useRef, useState } from "react";
import { createStudentFilterState, type StudentFilterState } from "./StudentFilter";
import {
  normalizeStudentFilterState,
  type StudentFilterCookieOptions,
  serializeStudentFilterStateCookie,
  writeStudentFilterStateCookie,
} from "./student-filter-cookie";

export type PersistentStudentFilterStateOptions = StudentFilterCookieOptions & {
  initialState?: StudentFilterState;
};

export function usePersistentStudentFilterState(options: PersistentStudentFilterStateOptions) {
  const {
    allowedSorts,
    allowedGroups,
    allowedDisplays,
    cookieName,
    cookiePath,
    defaultSort,
    defaultGroup,
    defaultDisplay,
    initialState,
  } = options;
  const normalizationOptions = useMemo(
    () => ({ defaultSort, allowedSorts, defaultGroup, allowedGroups, defaultDisplay, allowedDisplays }),
    [allowedDisplays, allowedGroups, allowedSorts, defaultDisplay, defaultGroup, defaultSort],
  );
  const [state, setState] = useState<StudentFilterState>(() =>
    normalizeStudentFilterState(initialState ?? createStudentFilterState(defaultSort), normalizationOptions),
  );
  const stateRef = useRef(state);
  const serializedStateRef = useRef(serializeStudentFilterStateCookie(normalizationOptions, state));

  const setPersistentState = useCallback(
    (updater: React.SetStateAction<StudentFilterState>) => {
      const nextState = typeof updater === "function" ? updater(stateRef.current) : updater;
      stateRef.current = nextState;
      const serializedState = serializeStudentFilterStateCookie(normalizationOptions, nextState);
      if (serializedState !== serializedStateRef.current) {
        writeStudentFilterStateCookie(
          {
            cookieName,
            cookiePath,
            defaultSort,
            allowedSorts,
            defaultGroup,
            allowedGroups,
            defaultDisplay,
            allowedDisplays,
          },
          nextState,
        );
        serializedStateRef.current = serializedState;
      }
      setState(nextState);
    },
    [
      allowedDisplays,
      allowedGroups,
      allowedSorts,
      cookieName,
      cookiePath,
      defaultDisplay,
      defaultGroup,
      defaultSort,
      normalizationOptions,
    ],
  );

  return [state, setPersistentState] as const;
}
