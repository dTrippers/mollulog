export type Difficulty = "normal" | "hard" | "very_hard" | "hardcore" | "extreme" | "insane" | "torment" | "lunatic";

export type RaidScoreRange = {
  gte?: number;
  lt?: number;
};

const DIFFICULTIES: Difficulty[] = [
  "normal",
  "hard",
  "very_hard",
  "hardcore",
  "extreme",
  "insane",
  "torment",
  "lunatic",
];

export function parseDifficulty(value: string | null | undefined): Difficulty | null {
  return DIFFICULTIES.includes(value as Difficulty) ? (value as Difficulty) : null;
}

export function getFilterableRaidDifficulties(maxDifficulty: string | null | undefined): Difficulty[] {
  if (maxDifficulty === "lunatic") {
    return ["lunatic", "torment", "insane"];
  }
  if (maxDifficulty === "torment") {
    return ["torment", "insane"];
  }
  if (maxDifficulty === "insane") {
    return ["insane", "extreme"];
  }
  return [];
}

export function getRaidDifficultyScoreRange(difficulty: Difficulty | null): RaidScoreRange | undefined {
  if (difficulty === "lunatic") {
    return { gte: 44025000, lt: 99999999 };
  }
  if (difficulty === "torment") {
    return { gte: 31076000, lt: 44025000 };
  }
  if (difficulty === "insane") {
    return { gte: 19249600, lt: 31076000 };
  }
  if (difficulty === "extreme") {
    return { gte: 0, lt: 19249600 };
  }
  return undefined;
}

export const TOTAL_ASSAULT_BOSS_UIDS = [
  "binah",
  "chesed",
  "hod",
  "shirokuro",
  "perorodzilla",
  "goz",
  "hieronymus",
  "kaiten",
  "gregorius",
  "hovercraft",
  "kurokage",
  "geburah",
  "yesod",
  "drumbarka",
] as const;

export type Boss = (typeof TOTAL_ASSAULT_BOSS_UIDS)[number];

export const ALL_TOTAL_ASSUALT_BOSS: Boss[] = [...TOTAL_ASSAULT_BOSS_UIDS];

export const LEGACY_BOSS_UIDS: Partial<Record<string, Boss>> = {
  perorozilla: "perorodzilla",
  "kaiten-fx-mk0": "kaiten",
  "myouki-kurokage": "kurokage",
};

export function normalizeBossUid(boss: string): Boss | null {
  if ((TOTAL_ASSAULT_BOSS_UIDS as readonly string[]).includes(boss)) {
    return boss as Boss;
  }
  return LEGACY_BOSS_UIDS[boss] ?? null;
}

export const RAID_TIME_SCORE_PER_SECOND = {
  normal: 120,
  hard: 240,
  very_hard: 480,
  hardcore: 960,
  extreme: 1440,
  insane: 1920,
  torment: 2400,
  lunatic: 2880,
};

export const RAID_DIFFICULTY_SCORE = {
  normal: 250000,
  hard: 500000,
  very_hard: 1000000,
  hardcore: 2000000,
  extreme: 4000000,
  insane: 6800000,
  torment: 12200000,
  lunatic: 17710000,
};

export const RAID_HP_SCORE = {
  normal: { 180: 229000, 240: 277000, 270: 304700 },
  hard: { 180: 458000, 240: 554000, 270: 609400 },
  very_hard: { 180: 916000, 240: 1108000, 270: 1218800 },
  hardcore: { 180: 1832000, 240: 2216000, 270: 2437600 },
  extreme: { 180: 5392000, 240: 6160000, 270: 6578880 },
  insane: { 180: 12449600, 240: 14216000, 270: 14941016 },
  torment: { 180: 18876000, 240: 19508000, 270: 20302000 },
  lunatic: { 180: 25525000, 240: 26315000, 270: 26954000 },
};

export function timeForBoss(boss: Boss): 180 | 240 | 270 {
  if (boss === "yesod" || boss === "drumbarka") return 270;
  if (boss === "binah" || boss === "kaiten") return 180;
  return 240;
}

export function timeToScore(boss: Boss, difficulty: Difficulty, clearTimeMillisec: number): number {
  if (clearTimeMillisec < 0 || clearTimeMillisec > 3600000) {
    throw new Error("소요 시간은 0 ~ 60분 사이여야 해요");
  }

  const timePerBoss = timeForBoss(boss);
  const hpScore = RAID_HP_SCORE[difficulty][timePerBoss];
  if (hpScore === null) {
    throw new Error("선택한 보스는 아직 해당 난이도가 개최되지 않았어요");
  }

  const difficultyScore = RAID_DIFFICULTY_SCORE[difficulty];
  const timeScore = ((3600000 - clearTimeMillisec) / 1000) * RAID_TIME_SCORE_PER_SECOND[difficulty];
  return Math.round(difficultyScore + hpScore + timeScore);
}

export function scoreToDifficultyAndTime(
  boss: Boss,
  score: number,
): { difficulty: Difficulty; clearTimeMillisec: number } {
  const timePerBoss = timeForBoss(boss);
  const difficulties: Difficulty[] = [
    "normal",
    "hard",
    "very_hard",
    "hardcore",
    "extreme",
    "insane",
    "torment",
    "lunatic",
  ];

  // Try each difficulty from highest to lowest
  for (let i = difficulties.length - 1; i >= 0; i--) {
    const difficulty = difficulties[i];
    const hpScore = RAID_HP_SCORE[difficulty][timePerBoss];
    if (hpScore === null) {
      continue;
    }

    const difficultyScore = RAID_DIFFICULTY_SCORE[difficulty];
    const timeScore = score - difficultyScore - hpScore;

    const clearTimeMillisec = Math.round(3600000 - (timeScore * 1000) / RAID_TIME_SCORE_PER_SECOND[difficulty]);
    if (clearTimeMillisec >= 0 && clearTimeMillisec <= 3600000) {
      return { difficulty, clearTimeMillisec };
    }
  }

  throw new Error("유효하지 않은 점수에요");
}
