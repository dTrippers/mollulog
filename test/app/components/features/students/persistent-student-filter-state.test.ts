import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createStudentFilterState, type StudentFilterState } from "~/components/features/students/StudentFilter";
import {
  normalizeStudentFilterState,
  type PersistentStudentFilterStateOptions,
  readStudentFilterState,
  writeStudentFilterState,
} from "~/components/features/students/usePersistentStudentFilterState";
import { Attack, Defense } from "~/graphql/graphql";

const generalOptions: PersistentStudentFilterStateOptions = {
  storageKey: "mollulog::students::view-settings",
  defaultSort: "recent",
  allowedSorts: ["recent", "old", "name"],
};

const userOptions: PersistentStudentFilterStateOptions = {
  storageKey: "mollulog::user-students::view-settings",
  defaultSort: "recent",
  allowedSorts: ["recent", "old", "name", "tier"],
};

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const getItem = jest.fn((key: string) => values.get(key) ?? null);
  const setItem = jest.fn((key: string, value: string) => {
    values.set(key, value);
  });

  return {
    storage: { getItem, setItem } as unknown as Storage,
    getItem,
    setItem,
  };
}

let localStorageDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
});

afterEach(() => {
  if (localStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});

function installStorage(storage: Storage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
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

  it("falls back to the screen default for an unsupported sort", () => {
    const normalized = normalizeStudentFilterState({ sort: "tier", search: "아루" }, generalOptions);

    expect(normalized).toEqual({
      ...createStudentFilterState("recent"),
      search: "아루",
    });
  });

  it("accepts tier sorting on the user student screen", () => {
    expect(normalizeStudentFilterState({ sort: "tier" }, userOptions)).toEqual(createStudentFilterState("tier"));
  });

  it("keeps general and user student preferences under independent keys", () => {
    const storage = createStorage();
    installStorage(storage.storage);
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

    writeStudentFilterState(generalOptions, generalState);
    writeStudentFilterState(userOptions, userState);

    expect(readStudentFilterState(generalOptions)).toEqual(generalState);
    expect(readStudentFilterState(userOptions)).toEqual(userState);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("does not persist route-local batch state", () => {
    const storage = createStorage();
    installStorage(storage.storage);
    const state = {
      ...createStudentFilterState("recent"),
      batchAddMode: true,
      batchAddStudentUids: ["student-1"],
    } as StudentFilterState & { batchAddMode: boolean; batchAddStudentUids: string[] };

    writeStudentFilterState(generalOptions, state);

    expect(JSON.parse(storage.setItem.mock.calls[0]?.[1] ?? "{}")).toEqual(createStudentFilterState("recent"));
  });

  it("falls back to defaults and keeps working when storage is malformed or unavailable", () => {
    const storage = createStorage({ [generalOptions.storageKey]: "not-json" });
    installStorage(storage.storage);

    expect(readStudentFilterState(generalOptions)).toEqual(createStudentFilterState("recent"));

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage unavailable");
      },
    });

    expect(readStudentFilterState(generalOptions)).toEqual(createStudentFilterState("recent"));
    expect(() => writeStudentFilterState(generalOptions, createStudentFilterState("recent"))).not.toThrow();
  });
});
