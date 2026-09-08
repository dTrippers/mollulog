import { readFileSync } from "node:fs";
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

  it("keeps the owner edit link and equipment accessibility contracts in the card", () => {
    const source = readFileSync("app/routes/$username.students._components/StudentGrowthCard.tsx", "utf8");

    expect(source).toContain("PencilSquareIcon");
    expect(source).toContain('from "@heroicons/react/20/solid"');
    expect(source).toContain("encodeURIComponent(student.uid)");
    expect(source).toContain("#student-basic-info");
    expect(source).toContain("${" + "student.name} 성장 상태 편집");
    expect(source).toContain("inline-flex shrink-0 self-start rounded-md p-1.5");
    expect(source).toContain("text-sm font-semibold");
    expect(source).toContain("muted");
    expect(source).toContain('size="sm"');
    expect(source).toContain("미장착");
    expect(source).toContain("aria-disabled={!visual.available}");
    expect(source).toContain("equipmentValueDescription(visual)");
    expect(source).toContain('className="size-10 shrink-0 object-contain"');
    expect(source).not.toContain("border-dashed");
    const skillSectionStart = source.indexOf("function SkillTile");
    const skillSectionEnd = source.indexOf("function EquipmentTile", skillSectionStart);
    const skillSection = source.slice(skillSectionStart, skillSectionEnd);
    expect(skillSection).toContain("h-12");
    expect(skillSection).not.toContain("aspect-square");
    expect(skillSection).not.toContain("sm:h-auto");
    expect(skillSection).not.toContain("absolute top-1 left-1");
    const skillGroupStart = source.indexOf('<MetricGroup title="스킬">');
    const skillGroupEnd = source.indexOf('<MetricGroup title="장비">', skillGroupStart);
    const skillGroup = source.slice(skillGroupStart, skillGroupEnd);
    expect(skillGroup).toContain('className="space-y-0"');
    expect(skillGroup).not.toContain("space-y-0.5");
    expect(skillGroup).toContain(
      'className="grid h-4 grid-cols-4 gap-1 text-center text-[10px] font-semibold leading-4 text-muted-foreground"',
    );
    expect(skillGroup).toContain('aria-hidden="true"');
    expect(source).toContain('{ key: "ex", label: "EX" }');
    expect(source).toContain('{ key: "normal", label: "기본" }');
    expect(source).toContain('{ key: "enhanced", label: "강화" }');
    expect(source).toContain('{ key: "sub", label: "서브" }');
    expect(source).toContain("whitespace-nowrap rounded-sm bg-card px-0.5 text-[10px]");
    expect(source).toContain("z-20 rounded-sm bg-card");
    expect(source).toContain("whitespace-nowrap text-[10px] font-semibold leading-4 text-muted-foreground");
    expect(source).toContain("self-end whitespace-nowrap text-[10px] font-semibold tabular-nums");
    const equipmentSectionStart = source.indexOf('<MetricGroup title="장비">');
    const equipmentSectionEnd = source.indexOf("</MetricGroup>", equipmentSectionStart);
    const equipmentSection = source.slice(equipmentSectionStart, equipmentSectionEnd);
    expect(equipmentSection).toContain('className="grid grid-cols-4 gap-1"');
    expect(equipmentSection).not.toContain("grid-cols-3");
    const equipmentSource = source.slice(
      source.indexOf("function EquipmentTile"),
      source.indexOf("function SpecialEquipmentTile"),
    );
    expect(equipmentSource).not.toContain("top-1 left-1");
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
    expect(markup).toContain('aria-label="아루 성장 상태 편집"');
    expect(markup).toContain('aria-label="아루 EX 스킬 MAX"');
    expect(markup).toContain('aria-label="아루 강화 스킬 Lv.9"');
    expect(markup).toContain(">Lv.9</span>");
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
    expect(guestMarkup).not.toContain('aria-label="아루 성장 상태 편집"');

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
