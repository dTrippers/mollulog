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
  cookiePath: "/",
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
  if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
  else Reflect.deleteProperty(globalThis, "document");
  if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor);
  else Reflect.deleteProperty(globalThis, "location");
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
  Object.defineProperty(globalThis, "location", { configurable: true, value: { protocol } });
  return () => cookie;
}

describe("persistent shared student filter state", () => {
  it("normalizes known common fields and ignores unsupported values", () => {
    expect(
      normalizeStudentFilterState(
        {
          attackTypes: [Attack.Explosive, "retired-attack", 1],
          defenseTypes: "heavy",
          roles: ["special", "retired-role"],
          positions: ["back", "retired-position"],
          tacticRoles: ["healer", "retired-tactic-role"],
          sort: "old",
          search: "아루",
          schools: ["millennium"],
        },
        generalOptions,
      ),
    ).toEqual({
      ...createStudentFilterState("old"),
      attackTypes: [Attack.Explosive],
      roles: ["special"],
      positions: ["back"],
      tacticRoles: ["healer"],
    });
  });

  it("supports the username page's tier sort while rejecting it for the directory options", () => {
    expect(normalizeStudentFilterState({ sort: "tier" }, userOptions)).toEqual(createStudentFilterState("tier"));
    expect(normalizeStudentFilterState({ sort: "tier" }, generalOptions)).toEqual(createStudentFilterState("recent"));
  });

  it("keeps the two student pages in independent cookies and does not persist search", () => {
    const generalState = { ...createStudentFilterState("name"), attackTypes: [Attack.Explosive], search: "아루" };
    const userState = { ...createStudentFilterState("tier"), defenseTypes: [Defense.Heavy], search: "시로코" };
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
    const serialized = serializeStudentFilterStateCookie(generalOptions, generalState);
    expect(serialized).not.toBeNull();
    if (serialized === null) throw new Error("Expected a serialized general student filter state.");
    expect(JSON.parse(decodeURIComponent(serialized))).not.toHaveProperty("search");
  });

  it("serializes only common supported filters and sort", () => {
    const state = {
      ...createStudentFilterState("recent"),
      search: "아루",
      batchAddMode: true,
      batchAddStudentUids: ["student-1"],
    } as StudentFilterState & { batchAddMode: boolean; batchAddStudentUids: string[] };
    const serialized = serializeStudentFilterStateCookie(generalOptions, state);

    expect(serialized).not.toBeNull();
    if (serialized === null) throw new Error("Expected a serialized general student filter state.");
    expect(JSON.parse(decodeURIComponent(serialized))).toEqual({
      attackTypes: [],
      defenseTypes: [],
      roles: [],
      tacticRoles: [],
      positions: [],
      sort: "recent",
    });
  });

  it("falls back for malformed, unknown, oversized, missing, and unavailable cookies", () => {
    const defaults = createStudentFilterState("recent");
    const unknown = encodeURIComponent(JSON.stringify({ unknown: "value" }));
    const oversized = "x".repeat(MAX_STUDENT_FILTER_COOKIE_SIZE + 1);
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=not-json`, generalOptions)).toEqual(defaults);
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=%`, generalOptions)).toEqual(defaults);
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=${unknown}`, generalOptions)).toEqual(
      defaults,
    );
    expect(readStudentFilterStateFromCookie(`${generalOptions.cookieName}=${oversized}`, generalOptions)).toEqual(
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

  it("writes synchronously with the expected cookie attributes", () => {
    const getCookie = installBrowser();
    writeStudentFilterStateCookie(generalOptions, createStudentFilterState("old"));
    expect(getCookie()).toContain(`${generalOptions.cookieName}=`);
    expect(getCookie()).toContain("Path=/");
    expect(getCookie()).toContain(`Max-Age=${STUDENT_FILTER_COOKIE_MAX_AGE}`);
    expect(getCookie()).toContain("SameSite=Lax");
    expect(getCookie()).not.toContain("Secure");
  });

  it("adds Secure only on HTTPS", () => {
    const getCookie = installBrowser("https:");
    writeStudentFilterStateCookie(userOptions, createStudentFilterState("tier"));
    expect(getCookie()).toContain("Path=/");
    expect(getCookie()).toContain("SameSite=Lax; Secure");
  });
});
