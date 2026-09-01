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
  const { allowedSorts, cookieName, cookiePath, defaultSort, initialState } = options;
  const normalizationOptions = useMemo(() => ({ defaultSort, allowedSorts }), [allowedSorts, defaultSort]);
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
        writeStudentFilterStateCookie({ cookieName, cookiePath, defaultSort, allowedSorts }, nextState);
        serializedStateRef.current = serializedState;
      }
      setState(nextState);
    },
    [allowedSorts, cookieName, cookiePath, defaultSort, normalizationOptions],
  );

  return [state, setPersistentState] as const;
}
