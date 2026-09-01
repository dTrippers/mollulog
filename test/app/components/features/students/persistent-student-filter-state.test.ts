import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createStudentFilterState, type StudentFilterState } from "~/components/features/students/StudentFilter";
import {
  MAX_STUDENT_FILTER_COOKIE_SIZE,
  normalizeStudentFilterState,
  readStudentFilterStateFromCookie,
  STUDENT_FILTER_COOKIE_MAX_AGE,
  serializeStudentFilterStateCookie,
  writeStudentFilterStateCookie,
} from "~/components/features/students/student-filter-cookie";
import type { PersistentStudentFilterStateOptions } from "~/components/features/students/usePersistentStudentFilterState";
import { Attack, Defense } from "~/graphql/graphql";

const generalOptions: PersistentStudentFilterStateOptions = {
  cookieName: "mollulog_students_filter",
  cookiePath: "/students",
  defaultSort: "recent",
  allowedSorts: ["recent", "old", "name"],
};

const userOptions: PersistentStudentFilterStateOptions = {
  cookieName: "mollulog_user_students_filter",
  cookiePath: "/",
  defaultSort: "recent",
  allowedSorts: ["recent", "old", "name", "tier"],
};

function cookieHeader(options: PersistentStudentFilterStateOptions, state: StudentFilterState): string {
  const value = serializeStudentFilterStateCookie(options, state);
  expect(value).not.toBeNull();
  return `${options.cookieName}=${value}`;
}

let documentDescriptor: PropertyDescriptor | undefined;
let locationDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
});

afterEach(() => {
  if (documentDescriptor) {
    Object.defineProperty(globalThis, "document", documentDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "document");
  }

  if (locationDescriptor) {
    Object.defineProperty(globalThis, "location", locationDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "location");
  }
});

function installBrowser(protocol = "http:") {
  let cookie = "";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      },
    },
  });
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol },
  });
  return () => cookie;
}

describe("persistent student filter state", () => {
  it("normalizes each field without discarding valid values from other fields", () => {
    const normalized = normalizeStudentFilterState(
      {
        attackTypes: [Attack.Explosive, "retired-attack", 1],
        defenseTypes: "heavy",
        roles: ["special", "retired-role"],
        positions: ["back", "retired-position"],
        tacticRoles: ["healer", "retired-tactic-role"],
        sort: "old",
        search: 42,
      },
      generalOptions,
    );

    expect(normalized).toEqual({
      ...createStudentFilterState("old"),
      attackTypes: [Attack.Explosive],
      roles: ["special"],
      positions: ["back"],
      tacticRoles: ["healer"],
    });
  });

  it("falls back to the screen default for an unsupported sort and ignores search", () => {
    const normalized = normalizeStudentFilterState({ sort: "tier", search: "아루" }, generalOptions);

    expect(normalized).toEqual(createStudentFilterState("recent"));
  });

  it("accepts tier sorting on the user student screen", () => {
    expect(normalizeStudentFilterState({ sort: "tier" }, userOptions)).toEqual(createStudentFilterState("tier"));
  });

  it("keeps general and user student preferences in independent cookies", () => {
    const generalState: StudentFilterState = {
      ...createStudentFilterState("name"),
      attackTypes: [Attack.Explosive],
      search: "아루",
    };
    const userState: StudentFilterState = {
      ...createStudentFilterState("tier"),
      defenseTypes: [Defense.Heavy],
      search: "시로코",
    };

    expect(readStudentFilterStateFromCookie(cookieHeader(generalOptions, generalState), generalOptions)).toEqual({
      ...createStudentFilterState("name"),
      attackTypes: [Attack.Explosive],
    });
    expect(readStudentFilterStateFromCookie(cookieHeader(userOptions, userState), userOptions)).toEqual({
      ...createStudentFilterState("tier"),
      defenseTypes: [Defense.Heavy],
    });
    expect(readStudentFilterStateFromCookie(cookieHeader(generalOptions, generalState), userOptions)).toEqual(
      createStudentFilterState("recent"),
    );
  });

  it("serializes only supported filters and sort, excluding search and route-local state", () => {
    const state = {
      ...createStudentFilterState("recent"),
      search: "아루",
      batchAddMode: true,
      batchAddStudentUids: ["student-1"],
    } as StudentFilterState & { batchAddMode: boolean; batchAddStudentUids: string[] };
    const serialized = serializeStudentFilterStateCookie(generalOptions, state);

    expect(serialized).not.toBeNull();
    expect(JSON.parse(decodeURIComponent(serialized as string))).toEqual(createStudentFilterState("recent"));
  });

  it("falls back to defaults for malformed, unknown, oversized, missing, or unavailable cookies", () => {
    const defaults = createStudentFilterState("recent");
    const unknownState = encodeURIComponent(JSON.stringify({ unknown: "value" }));
    const oversizedValue = "x".repeat(MAX_STUDENT_FILTER_COOKIE_SIZE + 1);

    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=not-json`, generalOptions)).toEqual(defaults);
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=%`, generalOptions)).toEqual(defaults);
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=${unknownState}`, generalOptions)).toEqual(
      defaults,
    );
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=${oversizedValue}`, generalOptions)).toEqual(
      defaults,
    );
    expect(readStudentFilterStateFromCookie(null, generalOptions)).toEqual(defaults);
    expect(() => writeStudentFilterStateCookie(generalOptions, defaults)).not.toThrow();

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        throw new Error("cookies unavailable");
      },
    });
    expect(() => writeStudentFilterStateCookie(generalOptions, defaults)).not.toThrow();
  });

  it("writes the cookie synchronously with local-development-safe attributes", () => {
    const getCookie = installBrowser();
    writeStudentFilterStateCookie(generalOptions, createStudentFilterState("old"));

    expect(getCookie()).toContain(`${generalOptions.cookieName}=`);
    expect(getCookie()).toContain("Path=/students");
    expect(getCookie()).toContain(`Max-Age=${STUDENT_FILTER_COOKIE_MAX_AGE}`);
    expect(getCookie()).toContain("SameSite=Lax");
    expect(getCookie()).not.toContain("Secure");
  });

  it("adds Secure only when the browser is using HTTPS", () => {
    const getCookie = installBrowser("https:");
    writeStudentFilterStateCookie(userOptions, createStudentFilterState("tier"));

    expect(getCookie()).toContain("Path=/");
    expect(getCookie()).toContain("SameSite=Lax; Secure");
  });
});
