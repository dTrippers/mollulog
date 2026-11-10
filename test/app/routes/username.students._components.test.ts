import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Attack, Defense, Position, RoleEnum, TacticRole } from "~/graphql/graphql";
import { toGrowthRow } from "~/routes/$username.students._components/growth-edit-state";
import { shareStudentGrowthUrl } from "~/routes/$username.students._components/ShareStudentGrowthButton";
import { StudentGrowthTable } from "~/routes/$username.students._components/StudentGrowthTable";
import type { UserStudent } from "~/views/user-students.server";

type TestNavigator = {
  share?: jest.MockedFunction<(data: ShareData) => Promise<void>>;
  clipboard?: { writeText: jest.MockedFunction<(text: string) => Promise<void>> };
};

function setNavigator(value: TestNavigator) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
}

function setDocument(value: unknown) {
  Object.defineProperty(globalThis, "document", { configurable: true, value });
}

const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  setNavigator({
    share: jest.fn<(data: ShareData) => Promise<void>>(),
    clipboard: { writeText: jest.fn<(text: string) => Promise<void>>() },
  });
});

afterEach(() => {
  if (originalDocument === undefined) {
    delete (globalThis as { document?: unknown }).document;
  } else {
    setDocument(originalDocument);
  }
});

describe("student growth sharing", () => {
  it("uses Web Share when it is available", async () => {
    const share = (navigator as unknown as TestNavigator).share as jest.MockedFunction<
      (data: ShareData) => Promise<void>
    >;
    share.mockResolvedValue(undefined);

    await expect(shareStudentGrowthUrl("https://mollulog.test/@teacher/students?view=growth")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "학생 성장 상태",
      url: "https://mollulog.test/@teacher/students?view=growth",
    });
    expect((navigator as unknown as TestNavigator).clipboard?.writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when Web Share is unavailable", async () => {
    const clipboard = { writeText: jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) };
    setNavigator({ clipboard });

    await expect(shareStudentGrowthUrl("https://mollulog.test/growth")).resolves.toBe("copied");
    expect(clipboard.writeText).toHaveBeenCalledWith("https://mollulog.test/growth");
  });

  it("treats a Web Share cancellation as a non-error result", async () => {
    const share = (navigator as unknown as TestNavigator).share as jest.MockedFunction<
      (data: ShareData) => Promise<void>
    >;
    share.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "AbortError" }));

    await expect(shareStudentGrowthUrl("https://mollulog.test/growth")).resolves.toBe("cancelled");
    expect((navigator as unknown as TestNavigator).clipboard?.writeText).not.toHaveBeenCalled();
  });

  it("reports an explicit error when Web Share and both clipboard paths fail", async () => {
    const share = jest.fn<(data: ShareData) => Promise<void>>().mockRejectedValue(new Error("share unavailable"));
    const writeText = jest.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("clipboard unavailable"));
    const execCommand = jest.fn((_command: string) => false);
    const textarea = {
      value: "",
      setAttribute: jest.fn(),
      style: {} as Record<string, string>,
      select: jest.fn(),
      remove: jest.fn(),
    };
    setNavigator({ share, clipboard: { writeText } });
    setDocument({
      createElement: jest.fn(() => textarea),
      body: { appendChild: jest.fn() },
      execCommand,
    });

    await expect(shareStudentGrowthUrl("https://mollulog.test/growth")).rejects.toThrow("clipboard unavailable");
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("https://mollulog.test/growth");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});

const growthStudent: UserStudent = {
  uid: "student a",
  name: "아루",
  attackType: Attack.Explosive,
  defenseType: Defense.Light,
  role: RoleEnum.Striker,
  position: Position.Front,
  tacticRole: TacticRole.Attacker,
  order: 1,
  initialTier: 3,
  tier: 6,
  growth: {
    bond: 20,
    level: 80,
    weaponLevel: 30,
    skillEx: 5,
    skillNormal: 10,
    skillEnhanced: 9,
    skillSub: null,
    equipment: [
      { available: true, category: "Hat", tier: null, level: null, maxLevel: null, uid: null },
      { available: true, category: "Gloves", tier: 5, level: 40, maxLevel: 50, uid: "gloves-5" },
      { available: false, category: null, tier: null, level: null, maxLevel: null, uid: null },
    ],
    equipSpecial: 2,
    equipSpecialAvailable: true,
    abilityHp: 10,
    abilityAtk: 11,
    abilityHeal: 12,
    weaponAvailable: true,
  },
};

function renderTable(mode: "view" | "edit", stacked = false) {
  const row = toGrowthRow(growthStudent);
  if (!row) throw new Error("fixture has no growth row");
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(StudentGrowthTable, {
        rows: [row],
        mode,
        stacked,
        activeTab: "basic",
        onTabChange: () => undefined,
        draft: {},
        baseline: {},
        errors: {},
        conflicts: {},
        disabled: false,
        onValueChange: () => undefined,
        getDetailHref: (uid: string) => `/students/${encodeURIComponent(uid)}#student-basic-info`,
      }),
    ),
  );
}

describe("student growth table", () => {
  it("renders the read-only table with a link to the student's basic info", () => {
    const markup = renderTable("view");

    expect(markup).toContain('href="/students/student%20a#student-basic-info"');
    expect(markup).toContain("아루");
    expect(markup).toContain("미장착");
    expect(markup).not.toContain("<input");
  });

  it("renders one input per editable value in edit mode", () => {
    const markup = renderTable("edit");

    expect(markup).toContain("<input");
    expect(markup).toContain('aria-label="아루 학생 Lv"');
    expect(markup).toContain('aria-label="아루 인연 랭크"');
  });
});
