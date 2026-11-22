import { describe, expect, it } from "@jest/globals";
import {
  computeRaidClearResult,
  countRaidRankTiers,
  defaultRaidRecordScoreMode,
  formatRaidClearTime,
  getRaidMaxScore,
  getRaidMaxTotalScore,
  getRaidRankConfirmAt,
  getRaidRecordRankStatus,
  getRaidRecordShownTotalScore,
  getRaidRecordTotalScore,
  InvalidRaidRecordError,
  isRaidSeasonOngoing,
  isRaidSeasonStarted,
  isScoreOnlyRaidRecord,
  normalizeRaidRecordMemo,
  normalizeRaidRecordScores,
  parseRaidRecordParties,
  parseRaidRecordRank,
  parseRaidRecordScore,
  parseRaidRecordScoreMode,
  parseRaidRecordTotalScore,
  type RaidRecordSeasonRules,
  type RaidRecordStudentInfo,
  raidRankTier,
  readStoredRaidRecordParties,
  readStoredRaidRecordScores,
  readStoredRaidRecordTotal,
} from "~/domain/raid-record";

const eliminationRules: RaidRecordSeasonRules = {
  raidType: "elimination",
  defenseTypes: [
    { defenseType: "heavy", maxDifficulty: "torment" },
    { defenseType: "elastic", maxDifficulty: "torment" },
    { defenseType: "light", maxDifficulty: "insane" },
  ],
};

const totalAssaultRules: RaidRecordSeasonRules = {
  raidType: "total_assault",
  defenseTypes: [{ defenseType: "special", maxDifficulty: "lunatic" }],
};

const students = new Map<string, RaidRecordStudentInfo>([
  ["striker-a", { role: "striker", equipmentSlots: 3, gearAvailable: true, weaponAvailable: true }],
  ["striker-b", { role: "striker", equipmentSlots: 2, gearAvailable: false, weaponAvailable: false }],
  ["special-a", { role: "special", equipmentSlots: 3 }],
]);

function unit(slot: number, studentUid: string, extra: Record<string, unknown> = {}) {
  return { slot, studentUid, ...extra };
}

function expectInvalid(run: () => unknown, message: string) {
  expect(run).toThrow(InvalidRaidRecordError);
  expect(run).toThrow(message);
}

describe("raid record seasons", () => {
  it("treats a season as started from its start time and ongoing until its end time", () => {
    const season = { startAt: "2026-11-03T02:00:00Z", endAt: "2026-11-09T19:00:00Z" };

    expect(isRaidSeasonStarted(season, "2026-11-03T01:59:59Z")).toBe(false);
    expect(isRaidSeasonStarted(season, "2026-11-03T02:00:00Z")).toBe(true);
    expect(isRaidSeasonOngoing(season, "2026-11-09T18:59:59Z")).toBe(true);
    expect(isRaidSeasonOngoing(season, "2026-11-09T19:00:00Z")).toBe(false);
    expect(isRaidSeasonOngoing({ ...season, endAt: null }, "2027-01-01T00:00:00Z")).toBe(true);
  });

  it("confirms ranks at 0시 UTC+9 of the day after the season ends", () => {
    // Ends 04:00 KST on 11/24; ranks confirm at 00:00 KST on 11/25.
    expect(getRaidRankConfirmAt("2026-11-23T19:00:00Z")).toBe("2026-11-24T15:00:00.000Z");
    // Ends 23:59 KST on 11/24; still confirms at 00:00 KST on 11/25.
    expect(getRaidRankConfirmAt("2026-11-24T14:59:00Z")).toBe("2026-11-24T15:00:00.000Z");
    expectInvalid(() => getRaidRankConfirmAt("not a date"), "시즌 종료 시각을 확인하지 못했어요.");
  });

  it("calls a rank 확정 only when it was entered at or after the confirmation time", () => {
    const confirmAt = "2026-11-24T15:00:00.000Z";

    expect(getRaidRecordRankStatus({ rank: null, rankRecordedAt: null }, confirmAt)).toBe("missing");
    expect(getRaidRecordRankStatus({ rank: 1200, rankRecordedAt: null }, confirmAt)).toBe("missing");
    expect(getRaidRecordRankStatus({ rank: 1200, rankRecordedAt: "2026-11-24T14:59:59Z" }, confirmAt)).toBe(
      "provisional",
    );
    expect(getRaidRecordRankStatus({ rank: 1200, rankRecordedAt: "2026-11-24T15:00:00Z" }, confirmAt)).toBe(
      "confirmed",
    );
    // A season without an end time has no confirmation time yet.
    expect(getRaidRecordRankStatus({ rank: 1200, rankRecordedAt: "2026-11-30T00:00:00Z" }, null)).toBe("provisional");
  });

  it("counts a record as score-only when it has no rank, memo, or student", () => {
    const record = {
      scoreMode: "defense_type" as const,
      rank: null,
      memo: "  ",
      parties: [{ defenseType: "heavy" as const, units: [] }],
    };

    expect(isScoreOnlyRaidRecord(record)).toBe(true);
    // A record that shows its total alone was entered with a rank on a form.
    expect(isScoreOnlyRaidRecord({ ...record, scoreMode: "total" })).toBe(false);
    expect(isScoreOnlyRaidRecord({ ...record, rank: 1 })).toBe(false);
    expect(isScoreOnlyRaidRecord({ ...record, memo: "메모" })).toBe(false);
    expect(
      isScoreOnlyRaidRecord({
        ...record,
        parties: [{ defenseType: "heavy", units: [{ slot: 0, studentUid: "striker-a", assist: false, snapshot: {} }] }],
      }),
    ).toBe(false);
  });

  it("sums the scores of every defense type", () => {
    expect(getRaidRecordTotalScore([{ score: 40_000_000 }, { score: 39_000_000 }, { score: 27_000_000 }])).toBe(
      106_000_000,
    );
    expect(getRaidRecordTotalScore([])).toBe(0);
  });
});

describe("raid record score → difficulty and clear time", () => {
  // The floors and maxima below match the bands the ranks service returned for 240-second bosses (JP 총력전 94 and
  // 대결전 38), which come from the same formula.
  it("reads a score with the in-game formula of the boss's time limit", () => {
    expect(computeRaidClearResult("hod", 40_000_000)).toEqual({ difficulty: "torment", clearTimeMs: 145_000 });
    expect(computeRaidClearResult("hod", 44_025_000)).toEqual({ difficulty: "lunatic", clearTimeMs: 3_600_000 });
    expect(computeRaidClearResult("hod", 54_393_000)).toEqual({ difficulty: "lunatic", clearTimeMs: 0 });
    // Binah is a 3-minute boss, with a lower HP score.
    expect(computeRaidClearResult("binah", 44_025_000)).toEqual({ difficulty: "lunatic", clearTimeMs: 3_325_694 });
    // A legacy boss uid reads as its current one.
    expect(computeRaidClearResult("kaiten-fx-mk0", 44_025_000)).toEqual(computeRaidClearResult("binah", 44_025_000));
    // 악몽 열차 is a 4-minute boss under both of its uids.
    expect(computeRaidClearResult("nightmare_train", 44_025_000)).toEqual(computeRaidClearResult("hod", 44_025_000));
    expect(getRaidMaxScore("nightmare", "lunatic")).toBe(54_393_000);
  });

  it("has no result for a score no difficulty produces or a boss the formula does not know", () => {
    // Between the top of torment (40,348,000) and the floor of lunatic.
    expect(computeRaidClearResult("hod", 42_000_000)).toBeNull();
    expect(computeRaidClearResult("hod", 54_393_001)).toBeNull();
    expect(computeRaidClearResult("hod", 500_000)).toBeNull();
    expect(computeRaidClearResult("a-new-boss", 40_000_000)).toBeNull();
  });

  it("takes the season's top difficulty cleared at once as the maximum score", () => {
    expect(getRaidMaxScore("hod", "torment")).toBe(40_348_000);
    expect(getRaidMaxScore("hod", "lunatic")).toBe(54_393_000);
    // Without a known boss or top difficulty, no score is rejected.
    expect(getRaidMaxScore("hod", null)).toBeNull();
    expect(getRaidMaxScore("hod", "unknown")).toBeNull();
    expect(getRaidMaxScore("a-new-boss", "lunatic")).toBeNull();
  });

  it("formats a clear time as m:ss.mmm", () => {
    expect(formatRaidClearTime(145_000)).toBe("2:25.000");
    expect(formatRaidClearTime(561_667)).toBe("9:21.667");
    expect(formatRaidClearTime(-5)).toBe("0:00.000");
  });
});

describe("raid rank tier", () => {
  it("puts the last rank of each band in that tier", () => {
    expect(raidRankTier("kr", "total_assault", 88, 12_000)).toBe("platinum");
    expect(raidRankTier("kr", "total_assault", 88, 12_001)).toBe("gold");
    expect(raidRankTier("kr", "total_assault", 88, 55_000)).toBe("gold");
    expect(raidRankTier("kr", "total_assault", 88, 55_001)).toBe("silver");
    expect(raidRankTier("kr", "total_assault", 88, 100_000)).toBe("silver");
    expect(raidRankTier("kr", "total_assault", 88, 100_001)).toBe("bronze");
  });

  it("uses the bands of the season the record belongs to", () => {
    expect(raidRankTier("kr", "total_assault", 43, 11_000)).toBe("gold");
    expect(raidRankTier("kr", "total_assault", 44, 11_000)).toBe("platinum");
    expect(raidRankTier("kr", "elimination", 1, 12_000)).toBe("platinum");
  });

  it("uses the jp bands on the jp server", () => {
    expect(raidRankTier("jp", "total_assault", 80, 20_000)).toBe("platinum");
    expect(raidRankTier("jp", "elimination", 30, 120_001)).toBe("silver");
    expect(raidRankTier("jp", "total_assault", 80, 240_001)).toBe("bronze");
  });

  it("counts records per tier and skips records without a rank", () => {
    const record = (seasonIndex: number, rank: number | null) => ({
      server: "kr" as const,
      raidType: "total_assault" as const,
      seasonIndex,
      rank,
    });
    expect(
      countRaidRankTiers([
        record(88, 12_000),
        record(87, 3_000),
        // Gold under the bands before season 44, platinum after.
        record(43, 11_000),
        record(86, 100_001),
        record(85, null),
      ]),
    ).toEqual({ platinum: 2, gold: 1, silver: 0, bronze: 1 });
    expect(countRaidRankTiers([])).toEqual({ platinum: 0, gold: 0, silver: 0, bronze: 0 });
  });

  it("has no tier for a rank that is not a positive integer", () => {
    expect(raidRankTier("kr", "total_assault", 88, 0)).toBeNull();
    expect(raidRankTier("kr", "total_assault", 88, 1.5)).toBeNull();
  });
});

describe("raid record input", () => {
  it("parses scores and ranks with thousands separators", () => {
    expect(parseRaidRecordScore("40,000,000")).toBe(40_000_000);
    expect(parseRaidRecordScore(27_000_000)).toBe(27_000_000);
    expect(parseRaidRecordScore("")).toBeNull();
    expect(parseRaidRecordScore(null)).toBeNull();
    expectInvalid(() => parseRaidRecordScore(0), "점수를 확인해 주세요.");
    expectInvalid(() => parseRaidRecordScore("1.5"), "점수를 확인해 주세요.");
    expectInvalid(() => parseRaidRecordScore(1_000_000_000), "점수를 확인해 주세요.");

    expect(parseRaidRecordRank("12,345")).toBe(12_345);
    expect(parseRaidRecordRank(undefined)).toBeNull();
    expectInvalid(() => parseRaidRecordRank(-1), "순위를 확인해 주세요.");
    expectInvalid(() => parseRaidRecordRank(100_000_000), "순위를 확인해 주세요.");
  });

  it("keeps the entered scores in the season's defense type order", () => {
    expect(
      normalizeRaidRecordScores(
        [
          { defenseType: "light", score: 27_000_000 },
          { defenseType: "elastic", score: null },
          { defenseType: "heavy", score: 40_000_000 },
        ],
        eliminationRules,
      ),
    ).toEqual([
      { defenseType: "heavy", score: 40_000_000 },
      { defenseType: "light", score: 27_000_000 },
    ]);
  });

  it("rejects a score of a defense type the season does not have, or one entered twice", () => {
    expectInvalid(
      () => normalizeRaidRecordScores([{ defenseType: "special", score: 1 }], eliminationRules),
      "이 시즌에 없는 방어 타입의 점수예요.",
    );
    expectInvalid(
      () => normalizeRaidRecordScores([{ defenseType: "unknown", score: 1 }], eliminationRules),
      "이 시즌에 없는 방어 타입의 점수예요.",
    );
    expectInvalid(
      () =>
        normalizeRaidRecordScores(
          [
            { defenseType: "heavy", score: 1 },
            { defenseType: "heavy", score: null },
          ],
          eliminationRules,
        ),
      "같은 방어 타입의 점수가 두 번 들어왔어요.",
    );
  });

  it("rejects a total_assault season that does not have exactly one defense type", () => {
    expectInvalid(
      () =>
        normalizeRaidRecordScores([], {
          raidType: "total_assault",
          defenseTypes: [
            { defenseType: "special", maxDifficulty: "lunatic" },
            { defenseType: "light", maxDifficulty: "lunatic" },
          ],
        }),
      "총력전 시즌의 방어 타입을 확인하지 못했어요.",
    );
  });

  it("trims the memo and caps its length", () => {
    expect(normalizeRaidRecordMemo("  메모  ")).toBe("메모");
    expect(normalizeRaidRecordMemo(undefined)).toBe("");
    expect(normalizeRaidRecordMemo("가".repeat(1000))).toHaveLength(1000);
    expectInvalid(() => normalizeRaidRecordMemo("가".repeat(1001)), "메모는 1,000자까지 쓸 수 있어요.");
    expectInvalid(() => normalizeRaidRecordMemo(3), "메모를 확인해 주세요.");
  });
});

describe("raid record parties", () => {
  it("keeps parties with students, sorted by slot, and drops empty ones", () => {
    expect(
      parseRaidRecordParties(
        [
          {
            defenseType: "heavy",
            units: [
              unit(4, "special-a", { snapshot: { tier: 3 } }),
              unit(0, "striker-a", { assist: true, snapshot: { tier: 9, weaponLevel: 60, equipSpecial: 2 } }),
            ],
          },
          { defenseType: "elastic", units: [] },
        ],
        eliminationRules,
        students,
      ),
    ).toEqual([
      {
        defenseType: "heavy",
        units: [
          { slot: 0, studentUid: "striker-a", assist: true, snapshot: { tier: 9, weaponLevel: 60, equipSpecial: 2 } },
          { slot: 4, studentUid: "special-a", assist: false, snapshot: { tier: 3 } },
        ],
      },
    ]);
    expect(parseRaidRecordParties(undefined, eliminationRules, students)).toEqual([]);
  });

  it("rejects a party that does not fit the season or the slots", () => {
    const parse = (party: unknown) => () => parseRaidRecordParties([party], eliminationRules, students);

    expectInvalid(
      parse({ defenseType: "special", units: [unit(0, "striker-a")] }),
      "1파티의 방어 타입이 이 시즌에 없어요.",
    );
    expectInvalid(
      parse({ defenseType: "heavy", units: [unit(0, "special-a")] }),
      "1파티에 슬롯과 맞지 않는 학생이 있어요.",
    );
    expectInvalid(
      parse({ defenseType: "heavy", units: [unit(4, "striker-a")] }),
      "1파티에 슬롯과 맞지 않는 학생이 있어요.",
    );
    expectInvalid(
      parse({ defenseType: "heavy", units: [unit(0, "striker-a"), unit(0, "striker-b")] }),
      "1파티의 같은 슬롯에 학생이 둘 있어요.",
    );
    expectInvalid(
      parse({ defenseType: "heavy", units: [unit(0, "striker-a"), unit(1, "striker-a")] }),
      "1파티에 같은 학생이 둘 있어요.",
    );
    expectInvalid(parse({ defenseType: "heavy", units: [unit(0, "unknown")] }), "1파티에 찾을 수 없는 학생이 있어요.");
    expectInvalid(parse({ defenseType: "heavy", units: [unit(6, "striker-a")] }), "1파티의 슬롯을 확인해 주세요.");
    expectInvalid(
      parse({ defenseType: "heavy", units: [unit(0, "striker-a", { assist: "yes" })] }),
      "1파티의 조력자 표시를 확인해 주세요.",
    );
    expectInvalid(
      parse({ defenseType: "heavy", units: Array.from({ length: 7 }, (_, slot) => unit(slot, "striker-a")) }),
      "1파티에는 학생을 6명까지 넣을 수 있어요.",
    );
    expectInvalid(() => parseRaidRecordParties({}, eliminationRules, students), "편성을 확인해 주세요.");
  });

  it("allows 20 parties per defense type", () => {
    const parties = (count: number) =>
      Array.from({ length: count }, () => ({ defenseType: "special", units: [unit(0, "striker-a")] }));

    expect(parseRaidRecordParties(parties(20), totalAssaultRules, students)).toHaveLength(20);
    expectInvalid(
      () => parseRaidRecordParties(parties(21), totalAssaultRules, students),
      "파티는 20개까지 추가할 수 있어요.",
    );
  });

  it("checks each growth value against the student", () => {
    const parse = (studentUid: string, snapshot: Record<string, unknown>) => () =>
      parseRaidRecordParties(
        [{ defenseType: "heavy", units: [unit(0, studentUid, { snapshot })] }],
        eliminationRules,
        students,
      );

    expectInvalid(parse("striker-a", { level: 91 }), "1파티의 학생 Lv 값을 확인해 주세요.");
    expectInvalid(parse("striker-a", { bond: 20 }), "1파티의 성장 정보를 확인해 주세요.");
    expectInvalid(parse("striker-a", { tier: 5, abilityHp: 1 }), "1파티의 체력 해방은 ★6부터 입력할 수 있어요.");
    expectInvalid(parse("striker-b", { equip3: 1 }), "1파티의 학생에게 없는 장비 칸이 있어요.");
    expectInvalid(parse("striker-b", { equipSpecial: 1 }), "1파티에 애용품이 없는 학생의 애용품 값이 있어요.");
    expectInvalid(parse("striker-b", { weaponLevel: 1 }), "1파티에 고유무기가 없는 학생의 고유무기 값이 있어요.");
    expectInvalid(parse("striker-a", { tier: 7, weaponLevel: 41 }), "1파티의 고유무기 Lv이 성급에 비해 높아요.");

    // Below ★6 a zero weapon or ability value is dropped instead of kept.
    expect(parse("striker-a", { tier: 5, weaponLevel: 0, abilityAtk: 0, level: null })()).toEqual([
      { defenseType: "heavy", units: [{ slot: 0, studentUid: "striker-a", assist: false, snapshot: { tier: 5 } }] },
    ]);
    expect(parse("striker-a", { tier: 7, weaponLevel: 40 })()[0].units[0].snapshot).toEqual({
      tier: 7,
      weaponLevel: 40,
    });
  });
});

describe("stored raid record values", () => {
  it("reads stored parties and scores", () => {
    expect(
      readStoredRaidRecordParties([
        { defenseType: "heavy", units: [{ slot: 0, studentUid: "striker-a", snapshot: { tier: 9 } }] },
      ]),
    ).toEqual([
      { defenseType: "heavy", units: [{ slot: 0, studentUid: "striker-a", assist: false, snapshot: { tier: 9 } }] },
    ]);
    expect(readStoredRaidRecordScores([{ defenseType: "heavy", score: 40_000_000 }])).toEqual([
      { defenseType: "heavy", score: 40_000_000 },
    ]);
    // An entry saved with the difficulty and clear time it used to store reads as its score alone.
    expect(
      readStoredRaidRecordScores([{ defenseType: "heavy", score: 40_000_000, difficulty: "torment", clearTimeMs: 1 }]),
    ).toEqual([{ defenseType: "heavy", score: 40_000_000 }]);
  });

  it("fails on stored values that do not parse instead of reading them as empty", () => {
    expectInvalid(() => readStoredRaidRecordParties({}), "저장된 편성을 읽지 못했어요.");
    expectInvalid(
      () => readStoredRaidRecordParties([{ defenseType: "heavy", units: [{ slot: "0" }] }]),
      "저장된 편성을 읽지 못했어요.",
    );
    expectInvalid(() => readStoredRaidRecordScores(null), "저장된 점수를 읽지 못했어요.");
    expectInvalid(
      () => readStoredRaidRecordScores([{ defenseType: "heavy", score: "1" }]),
      "저장된 점수를 읽지 못했어요.",
    );
  });
});

describe("raid record total score", () => {
  it("starts a new 대결전 record of an ended season with the total alone", () => {
    expect(defaultRaidRecordScoreMode("elimination", false)).toBe("total");
    expect(defaultRaidRecordScoreMode("elimination", true)).toBe("defense_type");
    expect(defaultRaidRecordScoreMode("total_assault", false)).toBe("defense_type");
  });

  it("shows the total entered alone, or the sum of the scores", () => {
    const scores = [
      { defenseType: "heavy" as const, score: 40_000_000 },
      { defenseType: "light" as const, score: 30_000_000 },
    ];
    expect(getRaidRecordShownTotalScore({ scoreMode: "defense_type", scores, totalScore: 99_000_000 })).toBe(
      70_000_000,
    );
    expect(getRaidRecordShownTotalScore({ scoreMode: "total", scores, totalScore: 99_000_000 })).toBe(99_000_000);
    expect(() => getRaidRecordShownTotalScore({ scoreMode: "total", scores, totalScore: null })).toThrow(
      InvalidRaidRecordError,
    );
  });

  it("caps the total at the sum of the defense types' maximums, and not at all when one is unknown", () => {
    // Hod (4 minutes): torment tops out at 40,348,000.
    expect(getRaidMaxTotalScore("hod", [{ maxDifficulty: "torment" }, { maxDifficulty: "torment" }])).toBe(80_696_000);
    expect(getRaidMaxTotalScore("hod", [{ maxDifficulty: "torment" }, { maxDifficulty: null }])).toBeNull();
    expect(getRaidMaxTotalScore("a-new-boss", [{ maxDifficulty: "torment" }])).toBeNull();
    expect(getRaidMaxTotalScore("hod", [])).toBeNull();
  });

  it("parses a total and a score mode, and allows the total alone only on a 대결전 record", () => {
    expect(parseRaidRecordTotalScore("90,000,000")).toBe(90_000_000);
    expect(parseRaidRecordTotalScore("")).toBeNull();
    expect(() => parseRaidRecordTotalScore(0)).toThrow("합산 점수를 확인해 주세요.");
    expect(parseRaidRecordScoreMode(undefined, "elimination")).toBe("defense_type");
    expect(parseRaidRecordScoreMode("total", "elimination")).toBe("total");
    expect(() => parseRaidRecordScoreMode("total", "total_assault")).toThrow(
      "합산 점수는 대결전 기록에만 입력할 수 있어요.",
    );
    expect(() => parseRaidRecordScoreMode("sum", "elimination")).toThrow("점수 입력 방식을 확인해 주세요.");
  });

  it("fails on a stored total it cannot read", () => {
    expect(readStoredRaidRecordTotal("defense_type", null, "elimination")).toEqual({
      scoreMode: "defense_type",
      totalScore: null,
    });
    expect(readStoredRaidRecordTotal("total", 90_000_000, "elimination")).toEqual({
      scoreMode: "total",
      totalScore: 90_000_000,
    });
    expect(() => readStoredRaidRecordTotal("total", null, "elimination")).toThrow("저장된 합산 점수를 읽지 못했어요.");
    expect(() => readStoredRaidRecordTotal("total", 1, "total_assault")).toThrow(
      "저장된 점수 입력 방식을 읽지 못했어요.",
    );
    expect(() => readStoredRaidRecordTotal("sum", null, "elimination")).toThrow(
      "저장된 점수 입력 방식을 읽지 못했어요.",
    );
  });
});
