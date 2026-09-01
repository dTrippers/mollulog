import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSetState = jest.fn();
const mockWriteStudentFilterStateCookie = jest.fn();

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      mockSetState,
    ],
  };
});

jest.mock("~/components/features/students/student-filter-cookie", () => {
  const actual = jest.requireActual<typeof import("~/components/features/students/student-filter-cookie")>(
    "~/components/features/students/student-filter-cookie",
  );
  return { ...actual, writeStudentFilterStateCookie: mockWriteStudentFilterStateCookie };
});

import { createStudentFilterState } from "~/components/features/students/StudentFilter";
import {
  type PersistentStudentFilterStateOptions,
  usePersistentStudentFilterState,
} from "~/components/features/students/usePersistentStudentFilterState";
import { Attack } from "~/graphql/graphql";

const options: PersistentStudentFilterStateOptions = {
  cookieName: "mollulog_students_filter",
  cookiePath: "/students",
  defaultSort: "recent",
  allowedSorts: ["recent", "old", "name"],
};

beforeEach(() => {
  mockSetState.mockClear();
  mockWriteStudentFilterStateCookie.mockClear();
});

describe("usePersistentStudentFilterState persistence", () => {
  it("skips writes for search-only updates and writes filter/sort changes immediately", () => {
    const initialState = createStudentFilterState("recent");
    const [, setState] = usePersistentStudentFilterState({ ...options, initialState });

    setState({ ...initialState, search: "아루" });
    expect(mockWriteStudentFilterStateCookie).not.toHaveBeenCalled();

    setState({ ...initialState, attackTypes: [Attack.Explosive] });
    expect(mockWriteStudentFilterStateCookie).toHaveBeenCalledTimes(1);
    expect(mockWriteStudentFilterStateCookie.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetState.mock.invocationCallOrder[1],
    );

    setState({ ...initialState, sort: "old" });
    expect(mockWriteStudentFilterStateCookie).toHaveBeenCalledTimes(2);
  });
});
