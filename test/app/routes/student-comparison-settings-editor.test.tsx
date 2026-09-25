import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudentCalculatorCatalog } from "~/domain/student-calculator";
import { DEFAULT_STUDENT_COMPARISON_SETTINGS, type StudentComparisonSettings } from "~/domain/student-comparison";
import type { StudentComparisonStudent } from "~/models/student-comparison";
import StudentComparisonSettingsEditor from "~/routes/students.compare._components/StudentComparisonSettingsEditor";

const skillSlots = [
  ["ex", "EX 스킬", 5],
  ["public", "기본 스킬", 10],
  ["passive", "강화 스킬", 10],
  ["extra_passive", "서브 스킬", 10],
] as const;

const student = {
  uid: "10000",
  name: "아루",
  initialTier: 3,
  equipments: ["hat", "hairpin", "watch"],
  skills: skillSlots.map(([slot, name, maxLevel]) => ({
    uid: slot,
    skillType: slot,
    name,
    iconUrl: null,
    maxLevel,
    levels: [{ level: maxLevel, cost: null, statModifiers: [] }],
    description: null,
    additionalSkillUids: [],
    selectableSkills: [],
  })),
  catalog: {
    weapon: {},
    gear: {
      name: "아루의 지갑",
      tiers: [
        { tier: 1, openFavorLevel: 1 },
        { tier: 2, openFavorLevel: 150 },
      ],
    },
    skillConfigurations: [
      {
        formIndex: 0,
        minimumWeaponStar: 0,
        minimumGearTier: 0,
        selectExSkillActionSlot: null,
        slots: skillSlots.map(([slot]) => ({ slot, skills: [{ position: 0, skillUid: slot }] })),
      },
    ],
    favorRewards: [],
  },
} as unknown as StudentComparisonStudent;

const catalog = {
  equipment: ["hat", "hairpin", "watch"].map((category) => ({
    uid: `${category}-10`,
    category,
    tier: 10,
    maxLevel: 70,
    growthType: "STANDARD",
    name: `T10 ${category}`,
    modifiers: [],
  })),
} as unknown as StudentCalculatorCatalog;

const settings: StudentComparisonSettings = {
  ...DEFAULT_STUDENT_COMPARISON_SETTINGS,
  tier: 7,
  bond: 100,
  skillEx: 5,
  skillNormal: 10,
  skillEnhanced: 10,
  skillSub: 10,
  equip1: 10,
  equip2: 10,
  equip3: 10,
  equip1Level: 70,
  equip2Level: 70,
  equip3Level: 70,
  equipSpecial: 2,
};

function renderEditor(
  overrides: Partial<StudentComparisonSettings> = {},
  settingsValue: StudentComparisonSettings | null = { ...settings, ...overrides },
  includeClose = true,
) {
  return renderToStaticMarkup(
    createElement(StudentComparisonSettingsEditor, {
      student,
      catalog,
      settings: settingsValue,
      invalidFields: settingsValue === null ? ["level"] : [],
      settingsErrors: [],
      importMessage: null,
      isImporting: false,
      onImportSaved: () => undefined,
      onChange: () => undefined,
      onReset: () => undefined,
      onClose: includeClose ? () => undefined : undefined,
    }),
  );
}

describe("StudentComparisonSettingsEditor", () => {
  it("uses sliders for numeric growth settings and keeps one shared equipment-card layout", () => {
    const markup = renderEditor();

    expect(markup.match(/type="range"/g)).toHaveLength(17);
    expect(markup).not.toContain('type="text"');
    expect(markup).toContain('aria-label="레벨 90"');
    expect(markup).toContain('aria-label="인연 랭크 100"');
    expect(markup).toContain('aria-label="고유무기 레벨 Lv.40"');
    expect(markup).toContain('aria-label="EX 스킬 5"');
    expect(markup).toContain('aria-label="기본 스킬 10"');
    expect(markup).toContain('aria-label="강화 스킬 10"');
    expect(markup).toContain('aria-label="서브 스킬 10"');
    expect(markup).toContain('aria-label="모자 티어 T10"');
    expect(markup).toContain('aria-label="모자 레벨 Lv.70"');
    expect(markup).toContain('aria-label="애용품 티어 T2"');
    expect(markup).toContain('aria-label="능력 개방 최대 체력 25"');

    expect(markup).toContain("grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4");
    expect(markup).toContain("grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4");
    expect(markup).toContain('role="group" aria-labelledby="comparison-growth-equipment-0-title"');
    expect(markup).toContain('<h4 id="comparison-growth-equipment-0-title"');
    expect(markup).toContain(">모자</h4>");
    expect(markup).toContain(">티어</span>");
    expect(markup).toContain(">레벨</span>");
    expect(markup).toContain('role="group" aria-labelledby="comparison-growth-special-gear-title"');
    expect(markup).toContain('<h4 id="comparison-growth-special-gear-title"');
    expect(markup).toContain(">애용품</h4>");
    expect(markup).not.toContain("아루의 지갑");
    expect(markup).not.toContain("능력 개방을 선택한 레벨로 적용합니다.");
    expect(markup).not.toContain("계산 조건");
    expect(markup).not.toContain("스킬 효과 반영");
    expect(markup).not.toContain("아루 주요 능력치 현재값");
  });

  it("shows missing values without drawing a slider at a fabricated minimum", () => {
    const markup = renderEditor({}, {
      ...settings,
      level: null,
      bond: null,
      weaponLevel: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: 10,
      equip2: null,
      equip3: null,
      equip1Level: null,
      equip2Level: null,
      equip3Level: null,
      equipSpecial: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
    });

    expect(markup).toContain("<legend class=\"sr-only\">레벨 설정값 없음</legend>");
    expect(markup).toContain("<legend class=\"sr-only\">모자 레벨 설정값 없음</legend>");
    expect(markup).toContain("<legend class=\"sr-only\">헤어핀 티어 설정값 없음</legend>");
    expect(markup).toContain("<legend class=\"sr-only\">애용품 티어 설정값 없음</legend>");
    expect(markup).toContain(">설정값 없음</span>");
    expect(markup.match(/type="range"/g)).toHaveLength(1);
  });

  it("keeps equal reset and done actions together in a fixed footer", () => {
    const markup = renderEditor();
    const footer = markup.match(
      /<div class="flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">[\s\S]*?<\/div>/,
    )?.[0];

    expect(footer).toBeDefined();
    expect(footer?.match(/min-w-16/g)).toHaveLength(2);
    expect(footer).toContain(">초기화</button>");
    expect(footer).toContain(">완료</button>");
    expect(footer?.indexOf(">초기화</button>")).toBeLessThan(footer?.indexOf(">완료</button>") ?? -1);
    expect(footer).not.toContain("<svg");
  });

  it("keeps reset and done available when linked settings are invalid", () => {
    const markup = renderEditor({}, null);

    expect(markup).toContain("성장도 설정을 읽을 수 없어요");
    expect(markup).toContain("잘못된 항목: level");
    expect(markup).toContain(">초기화</button>");
    expect(markup).toContain(">완료</button>");
  });

  it("retains actionable lock status and the weapon's closed value", () => {
    const markup = renderEditor({ level: 5, tier: 5, weaponLevel: 0 });

    expect(markup).toContain("학생 Lv.10부터 적용");
    expect(markup).toContain("학생 Lv.20부터 적용");
    expect(markup).toContain('aria-label="고유무기 레벨 미개방"');
    expect(markup).not.toContain("고유무기 성급 1성부터 적용");
  });
});
