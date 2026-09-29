import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { StudentSkillIcon } from "~/components/features/students";
import { Attack, Defense, Position, RoleEnum, TacticRole } from "~/graphql/graphql";
import { shareStudentGrowthUrl } from "~/routes/$username.students._components/ShareStudentGrowthButton";
import StudentGrowthCard, { type GrowthStudent } from "~/routes/$username.students._components/StudentGrowthCard";

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

describe("student growth visual contracts", () => {
  it("renders the shared attack-colored hex skill frame", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentSkillIcon, { attackType: Attack.Explosive, iconUrl: "https://assets.test/skill" }),
    );
    const mutedMarkup = renderToStaticMarkup(
      createElement(StudentSkillIcon, {
        attackType: Attack.Explosive,
        iconUrl: "https://assets.test/skill",
        muted: true,
        size: "sm",
      }),
    );

    expect(markup).toContain("text-red-600");
    expect(markup).toContain("<svg");
    expect(markup).toContain('src="https://assets.test/skill"');
    expect(markup).toContain("h-12 w-[2.598rem]");
    expect(markup).toContain('class="relative z-10 size-12 object-contain drop-shadow-sm"');
    expect(mutedMarkup).toContain("opacity-60");
    expect(mutedMarkup).toContain("h-10 w-[2.165rem]");
    expect(mutedMarkup).toContain('class="relative z-10 size-10 object-contain drop-shadow-sm"');
  });

  it("renders the owner edit link with an encoded student path", () => {
    const student = {
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
        level: 80,
        equipSpecial: 2,
        equipSpecialAvailable: true,
        abilityHp: 10,
        abilityAtk: 11,
        abilityHeal: 12,
        abilityAvailable: true,
        skillVisuals: {
          ex: { iconUrl: "https://assets.test/ex", level: 5, maxLevel: 5 },
          normal: { iconUrl: "https://assets.test/normal", level: 10, maxLevel: 10 },
          enhanced: { iconUrl: "https://assets.test/enhanced", level: 9, maxLevel: 10 },
          sub: { iconUrl: "https://assets.test/sub", level: 8, maxLevel: 10 },
        },
        equipmentVisuals: [
          { available: true, uid: null, tier: null },
          { available: false, uid: null, tier: null },
          { available: true, uid: "watch-5", tier: 5 },
        ],
      },
    } satisfies GrowthStudent;
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(StudentGrowthCard, { student, editable: true })),
    );

    expect(markup).toContain('href="/students/student%20a#student-basic-info"');
    expect(markup).toContain('href="/students/student%20a"');
    expect(markup).toContain('aria-label="아루 성장 상태 편집"');
    expect(markup).toContain('viewBox="0 0 16 16"');
    expect(markup).toContain('aria-label="아루 EX 스킬 MAX"');
    expect(markup).toContain('aria-label="아루 강화 스킬 Lv.9"');
    expect(markup).toContain(">Lv.9</span>");
    expect(markup).toContain('<h4 class="sr-only">스킬</h4>');
    expect(markup).toContain('<h4 class="sr-only">장비</h4>');
    expect(markup).toContain('<h4 class="sr-only">개방</h4>');
    expect(markup).toContain(">최대 체력</dt>");
    expect(markup).toContain('aria-label="아루 장비 1 미장착"');
    expect(markup).toContain('aria-label="아루 장비 2 해당 없음"');
    expect(markup).toContain('aria-label="아루 애용품 T2"');
    expect(markup).toContain(
      'class="absolute right-1 bottom-1 whitespace-nowrap rounded-sm bg-card px-0.5 text-[10px] font-semibold leading-4 tabular-nums">미장착</span>',
    );
    expect(markup).toContain(">미장착</span>");
    expect(markup).toContain(">-</span>");

    const unregisteredSkillMarkup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(StudentGrowthCard, {
          student: {
            ...student,
            growth: {
              ...student.growth,
              skillVisuals: {
                ...student.growth.skillVisuals,
                enhanced: { ...student.growth.skillVisuals.enhanced, level: null },
              },
            },
          },
          editable: false,
        }),
      ),
    );
    const skillTilesMarkup = unregisteredSkillMarkup.slice(
      unregisteredSkillMarkup.indexOf('aria-label="아루 EX 스킬'),
      unregisteredSkillMarkup.indexOf('aria-label="아루 장비'),
    );
    expect(skillTilesMarkup).toContain('aria-label="아루 강화 스킬 미등록"');
    expect(skillTilesMarkup).toContain(">-</span>");

    const guestMarkup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(StudentGrowthCard, { student, editable: false })),
    );
    expect(guestMarkup).toContain('href="/students/student%20a"');
    expect(guestMarkup).toContain('viewBox="0 0 16 16"');
    expect(guestMarkup).not.toContain('aria-label="아루 성장 상태 편집"');

    const longName = "이름이아주길어서chevron공간을보장해야해요";
    const longNameMarkup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(StudentGrowthCard, {
          student: { ...student, name: longName },
          editable: true,
        }),
      ),
    );
    expect(longNameMarkup).toContain(`class="min-w-0 truncate break-keep">${longName}</span>`);
    expect(longNameMarkup).toContain('viewBox="0 0 16 16"');

    const noSpecialMarkup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(StudentGrowthCard, {
          student: { ...student, growth: { ...student.growth, equipSpecialAvailable: false, equipSpecial: null } },
          editable: false,
        }),
      ),
    );
    const equipmentMarkup = noSpecialMarkup.slice(noSpecialMarkup.indexOf("장비"), noSpecialMarkup.indexOf("개방"));
    expect(equipmentMarkup).toContain("grid-cols-4");
    expect(equipmentMarkup).not.toContain("애용품");
  });
});
