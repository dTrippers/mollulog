import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudentCalculatorCatalog } from "~/domain/student-calculator";
import {
  DEFAULT_STUDENT_COMPARISON_SETTINGS,
  type StudentComparisonSettings,
  type StudentComparisonSide,
} from "~/domain/student-comparison";
import type { StudentComparisonStudent } from "~/models/student-comparison";
import StudentComparisonStudentSlot from "~/routes/students.compare._components/StudentComparisonStudentSlot";

function renderSlot(
  side: StudentComparisonSide,
  uidError: string | null = null,
  selected = false,
  settingsOverrides: Partial<StudentComparisonSettings> = {},
  studentOverrides: Partial<StudentComparisonStudent> = {},
  equipmentCatalog: StudentCalculatorCatalog["equipment"] | null = null,
  settingsErrors: string[] = [],
) {
  const student = selected
    ? ({
        uid: "10000",
        name: "아루",
        initialTier: 3,
        equipments: ["hat", "hairpin", "watch"],
        catalog: {},
        ...studentOverrides,
      } as unknown as StudentComparisonStudent)
    : null;
  const settings = selected ? { ...DEFAULT_STUDENT_COMPARISON_SETTINGS, ...settingsOverrides } : null;
  return renderToStaticMarkup(
    createElement(StudentComparisonStudentSlot, {
      side,
      student,
      uidError,
      chooserOpen: false,
      settings,
      equipmentCatalog,
      settingsErrors,
      onOpenChooser: () => undefined,
      onOpenSettings: () => undefined,
    }),
  );
}

function createEquipmentCatalog(): StudentCalculatorCatalog["equipment"] {
  return [
    { category: "hat", tier: 1, maxLevel: 30 },
    { category: "hat", tier: 2, maxLevel: 50 },
    { category: "hairpin", tier: 1, maxLevel: 30 },
    { category: "hairpin", tier: 2, maxLevel: 45 },
    { category: "hairpin", tier: 3, maxLevel: 60 },
    { category: "watch", tier: 1, maxLevel: 40 },
  ] as unknown as StudentCalculatorCatalog["equipment"];
}

function createMockupEquipmentCatalog(): StudentCalculatorCatalog["equipment"] {
  return [
    { category: "hat", tier: 1, maxLevel: 30 },
    { category: "hat", tier: 10, maxLevel: 50 },
    { category: "hairpin", tier: 1, maxLevel: 30 },
    { category: "hairpin", tier: 10, maxLevel: 50 },
    { category: "watch", tier: 1, maxLevel: 30 },
    { category: "watch", tier: 10, maxLevel: 50 },
  ] as unknown as StudentCalculatorCatalog["equipment"];
}

describe("StudentComparisonStudentSlot", () => {
  it("names blank slots by side while keeping clear student-selection buttons", () => {
    const left = renderSlot("left");
    const right = renderSlot("right");

    expect(left).toContain('aria-labelledby="left-student-side-label left-student-title"');
    expect(left).toContain('id="left-student-side-label"');
    expect(left).toContain("첫 번째 학생</p>");
    expect(left).toContain("학생 선택</h2>");
    expect(left).toContain('aria-label="첫 번째 학생 선택"');
    expect(left).toContain(">학생 선택</button>");
    expect(right).toContain('aria-labelledby="right-student-side-label right-student-title"');
    expect(right).toContain('id="right-student-side-label"');
    expect(right).toContain("두 번째 학생</p>");
    expect(right).toContain("학생 선택</h2>");
    expect(right).toContain('aria-label="두 번째 학생 선택"');
    expect(right).toContain(">학생 선택</button>");
  });

  it("shows the side label and growth summary before the actions", () => {
    const markup = renderSlot("left", null, true);
    const eyebrow = markup.indexOf("첫 번째 학생");
    const name = markup.indexOf("아루");
    const summary = markup.indexOf("적용된 성장도 전체 보기");
    const select = markup.indexOf("다른 학생 선택");
    const settings = markup.indexOf("성장도 설정");

    expect(eyebrow).toBeGreaterThanOrEqual(0);
    expect(name).toBeGreaterThan(eyebrow);
    expect(summary).toBeGreaterThan(name);
    expect(select).toBeGreaterThan(summary);
    expect(settings).toBeGreaterThan(select);
  });

  it("matches the approved default card copy exactly", () => {
    const markup = renderSlot(
      "left",
      null,
      true,
      {
        level: 90,
        tier: 7,
        bond: 100,
        weaponLevel: 40,
        skillEx: 5,
        skillNormal: 10,
        skillEnhanced: 10,
        skillSub: 10,
        equip1: 10,
        equip1Level: 50,
        equip2: 10,
        equip2Level: 50,
        equip3: 10,
        equip3Level: 50,
        equipSpecial: 2,
        abilityHp: 25,
        abilityAtk: 25,
        abilityHeal: 25,
      },
      {},
      createMockupEquipmentCatalog(),
    );

    expect(markup).toContain("첫 번째 학생</p>");
    expect(markup).toContain("아루</h2>");
    expect(markup).toContain("Lv.90 · ");
    expect(markup).toContain('<span class="sr-only">고유무기 </span>');
    expect(markup).toContain('src="/icons/exclusive_weapon.png" alt="" aria-hidden="true"');
    expect(markup).toContain('<span class="tabular-nums">2</span>');
    expect(markup).toContain("· 인연 100</p>");
    expect(markup).toContain('<span class="whitespace-nowrap">스킬 최대</span>');
    expect(markup).toContain('<span class="whitespace-nowrap">장비 최대</span>');
    expect(markup).toContain('<span class="whitespace-nowrap">능력 개방 최대</span>');
    expect(markup).not.toContain("고유무기 2성");
    expect(markup).not.toContain("무기 Lv.40");
    expect(markup).toContain("<span>적용된 성장도 전체 보기</span>");
    expect(markup).toContain(">다른 학생 선택</button>");
    expect(markup).toContain(">성장도 설정</button>");
    expect(markup).not.toContain("미적용 있음");

    const growthList = markup.match(/<dl[^>]*>[\s\S]*?<\/dl>/)?.[0] ?? "";
    expect(growthList).toContain("EX 5 · 기본 10 · 강화 10 · 서브 10");
    expect(growthList).toContain("모자 T10/Lv.50 · 헤어핀 T10/Lv.50 · 시계 T10/Lv.50");
    expect(growthList).toContain("애용품 T2 · 능력 개방 체력 25 / 공격 25 / 치유 25");
    expect(growthList).toContain("반영");
    expect(growthList).not.toContain("제외");
    expect(growthList).not.toContain("계산 조건");
    expect(growthList).not.toContain("기본 성장");
    expect(growthList).not.toContain("레벨");
    expect(growthList).not.toContain("신비 해방");
    expect(growthList).not.toContain("인연 랭크");
    expect(growthList).not.toContain("고유무기 레벨");
  });

  it("keeps the compact summary visible and all 18 values in a closed disclosure", () => {
    const markup = renderSlot("left", null, true, {
      level: 80,
      tier: 7,
      bond: 88,
      weaponLevel: 39,
      skillEx: 5,
      skillNormal: 9,
      skillEnhanced: 8,
      skillSub: 7,
      equip1: 10,
      equip1Level: 70,
      equip2: 8,
      equip2Level: 45,
      equip3: 7,
      equip3Level: 35,
      equipSpecial: 2,
      abilityHp: 1,
      abilityAtk: 2,
      abilityHeal: 3,
    });
    const detailsTag = markup.match(/<details[^>]*>/)?.[0] ?? "";

    expect(markup).toContain('<span class="tabular-nums">2</span>');
    expect(markup).toContain("· 인연 88</p>");
    expect(markup).toContain('<span class="whitespace-nowrap">스킬 5/9/8/7</span>');
    expect(markup).toContain('<span class="whitespace-nowrap">장비 T10/T8/T7</span>');
    expect(markup).toContain('<span class="whitespace-nowrap">능력 개방 1/2/3</span>');
    expect(markup).not.toContain("무기 Lv.39");
    expect(markup).toContain("적용된 성장도 전체 보기");
    expect(detailsTag).not.toContain("open");
    const growthList = markup.match(/<dl[^>]*>[\s\S]*?<\/dl>/)?.[0] ?? "";
    expect(growthList).toContain("EX 5 · 기본 9 · 강화 8 · 서브 7");
    expect(growthList).toContain("모자 T10/Lv.70 · 헤어핀 T8/Lv.45 · 시계 T7/Lv.35");
    expect(growthList).toContain("애용품 T2 · 능력 개방 체력 1 / 공격 2 / 치유 3");
    expect(growthList).toContain("반영");
    expect(growthList).not.toContain("기본 성장");
    expect(growthList).not.toContain("고유무기 레벨");
    expect(growthList).not.toContain("신비 해방");
    expect(growthList).not.toContain("인연 랭크");
  });

  it("aligns the disclosure chevron and gives both shared action buttons the same local styling", () => {
    const markup = renderSlot("left", null, true);
    const summary = markup.match(/<summary[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? "";
    const actionButtons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];

    expect(summary).toContain("inline-flex");
    expect(summary).toContain("items-center");
    expect(summary).toContain("<span>적용된 성장도 전체 보기</span>");
    expect(summary).toContain('aria-hidden="true"');
    expect(summary).toContain("group-open:rotate-180");
    expect(summary).not.toContain("⌄");

    expect(actionButtons).toHaveLength(2);
    for (const button of actionButtons) {
      expect(button).toContain("min-h-[34px]");
      expect(button).toContain("rounded-md");
      expect(button).toContain("border-border");
    }
    expect(actionButtons[1]).not.toContain("<svg");
  });

  it("shows 장비 최대 only when every slot has the actual catalog maximum tier and level", () => {
    const equipmentCatalog = createEquipmentCatalog();
    const maximumSettings = {
      equip1: 2,
      equip1Level: 50,
      equip2: 3,
      equip2Level: 60,
      equip3: 1,
      equip3Level: 40,
    };
    const atMaximum = renderSlot("left", null, true, maximumSettings, {}, equipmentCatalog);
    const lowerTier = renderSlot(
      "left",
      null,
      true,
      { ...maximumSettings, equip1: 1, equip1Level: 30 },
      {},
      equipmentCatalog,
    );
    const lowerLevel = renderSlot("left", null, true, { ...maximumSettings, equip3Level: 39 }, {}, equipmentCatalog);
    const missingCatalog = renderSlot("left", null, true, maximumSettings);
    const lockedSlot = renderSlot("left", null, true, { ...maximumSettings, level: 10 }, {}, equipmentCatalog);

    expect(atMaximum).toContain("스킬 자료 없음/자료 없음/자료 없음/자료 없음");
    expect(atMaximum).toContain("장비 최대");
    expect(atMaximum).toContain("능력 개방 최대");
    expect(lowerTier).toContain("장비 T1/T3/T1");
    expect(lowerTier).not.toContain("장비 최대");
    expect(lowerLevel).toContain("장비 T2/T3/T1");
    expect(lowerLevel).not.toContain("장비 최대");
    expect(missingCatalog).toContain("장비 T2/T3/T1");
    expect(missingCatalog).not.toContain("장비 최대");
    expect(lockedSlot).toContain("장비 T2/T3/T1");
    expect(lockedSlot).not.toContain("장비 최대");
  });

  it("uses the visible star icon and tier number for 신비 해방", () => {
    const markup = renderSlot("left", null, true, { tier: 5 });

    expect(markup).toContain('<span class="sr-only">신비 해방 </span>');
    expect(markup).toContain('class="size-3.5 shrink-0 text-yellow-500"');
    expect(markup).toContain('<span class="tabular-nums">5</span>');
    expect(markup).not.toContain("고유무기 5성");
  });

  it("shows the original invalid tier alongside its existing validation error", () => {
    const markup = renderSlot(
      "left",
      null,
      true,
      { tier: 1 },
      {},
      null,
      ["신비 해방 단계가 학생의 초기 성급보다 낮아요."],
    );
    const quickSummary = markup.match(/<p class="font-medium text-foreground">([\s\S]*?)<\/p>/)?.[1] ?? "";

    expect(markup).toContain("신비 해방 단계가 학생의 초기 성급보다 낮아요.");
    expect(quickSummary).toContain('<span class="tabular-nums">1</span>');
    expect(quickSummary).not.toContain('<span class="tabular-nums">3</span>');
  });

  it("retains the configured weapon level when the weapon is still locked", () => {
    const markup = renderSlot("left", null, true, { tier: 5, weaponLevel: 19 });
    const growthList = markup.match(/<dl[^>]*>[\s\S]*?<\/dl>/)?.[0] ?? "";

    expect(markup).not.toContain("무기 Lv.19");
    expect(growthList).not.toContain("고유무기 레벨");
    expect(growthList).toContain("미적용 · 고유무기 1성부터");
  });

  it("keeps missing detail values distinct from zero", () => {
    const markup = renderSlot("left", null, true, {
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip1Level: null,
      equip2: null,
      equip2Level: null,
      equip3: null,
      equip3Level: null,
      equipSpecial: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
    });
    const growthList = markup.match(/<dl[^>]*>[\s\S]*?<\/dl>/)?.[0] ?? "";

    expect(growthList).toContain("EX 자료 없음 · 기본 자료 없음 · 강화 자료 없음 · 서브 자료 없음");
    expect(growthList).toContain("모자 자료 없음/자료 없음 · 헤어핀 자료 없음/자료 없음 · 시계 자료 없음/자료 없음");
    expect(growthList).toContain(
      "애용품 자료 없음 · 능력 개방 체력 자료 없음 / 공격 자료 없음 / 치유 자료 없음",
    );
  });

  it("keeps ability levels visible while marking when they do not apply and names equipment slots", () => {
    const markup = renderSlot("left", null, true, {
      level: 80,
      equip1: 10,
      equip1Level: 70,
      equip2: 10,
      equip2Level: 70,
      equip3: 10,
      equip3Level: 70,
    });

    expect(markup).toContain("모자 T10/Lv.70");
    expect(markup).toContain("헤어핀 T10/Lv.70");
    expect(markup).toContain("시계 T10/Lv.70");
    expect(markup).toContain("미적용 · Lv.90부터");
    expect(markup).toContain("능력 개방 체력 25 / 공격 25 / 치유 25");
  });

  it("keeps locked equipment values visible and marks their unlock level", () => {
    const markup = renderSlot("left", null, true, {
      level: 10,
      equip3: 10,
      equip3Level: 70,
    });

    expect(markup).toContain("시계 T10/Lv.70");
    expect(markup).toContain("미적용: 시계 · Lv.20부터");
  });

  it("marks a favor-locked special gear tier only when its catalog unlock data exists", () => {
    const catalogWithLockedGear = {
      gear: {
        name: "애용품",
        description: null,
        tiers: [
          {
            tier: 2,
            openFavorLevel: 120,
            maxLevel: 40,
            growthType: "LINEAR",
            learnSkillSlot: null,
            learnSkillPosition: null,
            modifiers: [],
          },
        ],
      },
    } as unknown as StudentComparisonStudent["catalog"];
    const locked = renderSlot(
      "left",
      null,
      true,
      { bond: 100, equipSpecial: 2 },
      { catalog: catalogWithLockedGear },
    );
    const missing = renderSlot("left", null, true, { bond: 100, equipSpecial: 2 });

    expect(locked).toContain("애용품 T2");
    expect(locked).toContain("미적용: 애용품 · 인연 Lv.120부터");
    expect(missing).not.toContain("미적용: 애용품");
  });

  it("does not infer a locked slot when the student catalog is missing", () => {
    const markup = renderSlot(
      "left",
      null,
      true,
      { level: 10 },
      { catalog: null } as unknown as Partial<StudentComparisonStudent>,
    );

    expect(markup).not.toContain("미적용: 시계");
    expect(markup).toContain("학생 능력치 자료가 없어 성장도를 편집할 수 없어요.");
  });

  it("keeps invalid student feedback compact in the slot", () => {
    const markup = renderSlot("right", "학생을 찾지 못했어요.");

    expect(markup).toContain('aria-describedby="right-student-slot-error"');
    expect(markup).toContain('id="right-student-slot-error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("학생 정보 오류 · 바꾸기에서 학생을 다시 선택해 주세요.");
    expect(markup).not.toContain("다른 학생을 선택해 링크를 바로잡을 수 있어요.");
  });
});
