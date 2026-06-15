import type { Attack, Defense, RecruitmentGroupsListQuery, RecruitmentPoolStudentsQuery, RecruitmentTypeEnum } from "~/graphql/graphql";
import type { Role } from "~/models/content.d";

export type SimulationStudent = {
  uid: string;
  name: string;
  initialTier: number;
  attackType: Attack;
  defenseType: Defense;
  role: Role;
};

export type RecruitmentPoolStudent = SimulationStudent & {
  releaseAt: string | Date | null;
  archiveAt: string | Date | null;
  recruitments: {
    recruitmentType: RecruitmentTypeEnum;
  }[];
};

export type RecruitmentPoolGroup = {
  uid: string;
  recruitmentType: RecruitmentTypeEnum;
  startAt: string | Date;
  recruitments: {
    recruitmentType: RecruitmentTypeEnum;
    pickup: boolean;
    studentName: string;
    student: SimulationStudent | null;
  }[];
};

export type RecruitmentPoolSnapshot = {
  recruitmentGroupUid: string;
  recruitmentType: RecruitmentTypeEnum;
  startAt: string;
  pickupStudents: SimulationStudent[];
  nonPickupStudentsByTier: {
    tier1: SimulationStudent[];
    tier2: SimulationStudent[];
    tier3: SimulationStudent[];
  };
};

export type RecruitmentSlotRate = {
  tier1: number;
  tier2: number;
  tier3: number;
};

export type RecruitmentRateTable = {
  normalSlot: RecruitmentSlotRate;
  guaranteedSlot: RecruitmentSlotRate;
  pickupRates: Record<string, number>;
};

export const DEFAULT_PICKUP_STUDENT_RATE_BY_TIER = {
  tier2: 0.03,
  tier3: 0.007,
} as const;

export type RecruitmentDrawResult = {
  rarity: 1 | 2 | 3;
  pickup: boolean;
  student: SimulationStudent;
};

type BuildRecruitmentPoolSnapshotArgs = {
  recruitmentGroup: RecruitmentPoolGroup;
  students: RecruitmentPoolStudent[];
};

type DrawRecruitmentTenPullArgs = {
  snapshot: RecruitmentPoolSnapshot;
  rateTable?: RecruitmentRateTable;
  activePickupStudentUid: string | null;
  random?: () => number;
};

type BaqlRecruitmentGroup = NonNullable<RecruitmentGroupsListQuery["recruitmentGroups"][number]>;
type BaqlRecruitmentPoolStudent = RecruitmentPoolStudentsQuery["students"][number];

const EXCLUDED_RECRUITMENT_POOL_STUDENT_UIDS = new Set(["13004"]);

function instantTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function toSimulationStudent(student: SimulationStudent): SimulationStudent {
  return {
    uid: student.uid,
    name: student.name,
    initialTier: student.initialTier,
    attackType: student.attackType,
    defenseType: student.defenseType,
    role: student.role,
  };
}

function toSimulationStudentFromBaql(
  student: BaqlRecruitmentGroup["recruitments"][number]["student"],
): SimulationStudent | null {
  if (!student) {
    return null;
  }

  return {
    uid: student.uid,
    name: student.name,
    initialTier: student.initialTier,
    attackType: student.attackType,
    defenseType: student.defenseType,
    role: student.role as Role,
  };
}

function toPoolStudentFromBaql(student: BaqlRecruitmentPoolStudent): RecruitmentPoolStudent {
  return {
    uid: student.uid,
    name: student.name,
    initialTier: student.initialTier,
    attackType: student.attackType,
    defenseType: student.defenseType,
    role: student.role as Role,
    releaseAt: student.releaseAt,
    archiveAt: student.archiveAt,
    recruitments: student.recruitments.map((recruitment) => ({
      recruitmentType: recruitment.recruitmentType,
    })),
  };
}

function toPoolGroupFromBaql(group: BaqlRecruitmentGroup): RecruitmentPoolGroup {
  return {
    uid: group.uid,
    recruitmentType: group.recruitmentType,
    startAt: group.startAt,
    recruitments: group.recruitments.map((recruitment) => ({
      recruitmentType: recruitment.recruitmentType,
      pickup: recruitment.pickup,
      studentName: recruitment.studentName,
      student: toSimulationStudentFromBaql(recruitment.student),
    })),
  };
}

function isUsualRecruitmentType(recruitmentType: RecruitmentTypeEnum) {
  return recruitmentType === "usual";
}

function isGivenRecruitmentType(recruitmentType: RecruitmentTypeEnum) {
  return recruitmentType === "given";
}

function isFesRecruitmentType(recruitmentType: RecruitmentTypeEnum) {
  return recruitmentType === "fes";
}

function canAppearInNonPickupPool(student: RecruitmentPoolStudent, recruitmentGroupStartTime: number): boolean {
  if (EXCLUDED_RECRUITMENT_POOL_STUDENT_UIDS.has(student.uid)) {
    return false;
  }

  if (!student.releaseAt) {
    return false;
  }

  if (instantTime(student.releaseAt) > recruitmentGroupStartTime) {
    return false;
  }

  if (student.archiveAt && instantTime(student.archiveAt) <= recruitmentGroupStartTime) {
    return false;
  }

  if (student.recruitments.some((recruitment) => isUsualRecruitmentType(recruitment.recruitmentType))) {
    return true;
  }

  return (student.initialTier === 1 || student.initialTier === 2) && student.recruitments.length === 0;
}

function createEmptyTierGroups(): RecruitmentPoolSnapshot["nonPickupStudentsByTier"] {
  return {
    tier1: [],
    tier2: [],
    tier3: [],
  };
}

function addStudentByTier(groups: RecruitmentPoolSnapshot["nonPickupStudentsByTier"], student: SimulationStudent) {
  if (student.initialTier === 1) {
    groups.tier1.push(student);
  } else if (student.initialTier === 2) {
    groups.tier2.push(student);
  } else if (student.initialTier === 3) {
    groups.tier3.push(student);
  }
}

function rate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildRecruitmentPoolSnapshot({
  recruitmentGroup,
  students,
}: BuildRecruitmentPoolSnapshotArgs): RecruitmentPoolSnapshot {
  const pickupStudents = recruitmentGroup.recruitments
    .filter(
      (recruitment) => recruitment.pickup && !isGivenRecruitmentType(recruitment.recruitmentType) && recruitment.student,
    )
    .map((recruitment) => toSimulationStudent(recruitment.student as SimulationStudent));
  const pickupStudentUids = new Set(pickupStudents.map((student) => student.uid));
  const startTime = instantTime(recruitmentGroup.startAt);
  const nonPickupStudentsByTier = createEmptyTierGroups();
  const addedNonPickupStudentUids = new Set<string>();

  for (const student of students) {
    if (!canAppearInNonPickupPool(student, startTime)) {
      continue;
    }

    addStudentByTier(nonPickupStudentsByTier, toSimulationStudent(student));
    addedNonPickupStudentUids.add(student.uid);
  }

  for (const recruitment of recruitmentGroup.recruitments) {
    if (recruitment.pickup || isGivenRecruitmentType(recruitment.recruitmentType) || !recruitment.student) {
      continue;
    }

    if (EXCLUDED_RECRUITMENT_POOL_STUDENT_UIDS.has(recruitment.student.uid)) {
      continue;
    }

    if (pickupStudentUids.has(recruitment.student.uid) || addedNonPickupStudentUids.has(recruitment.student.uid)) {
      continue;
    }

    addStudentByTier(nonPickupStudentsByTier, toSimulationStudent(recruitment.student));
    addedNonPickupStudentUids.add(recruitment.student.uid);
  }

  for (const student of pickupStudents) {
    if (EXCLUDED_RECRUITMENT_POOL_STUDENT_UIDS.has(student.uid) || addedNonPickupStudentUids.has(student.uid)) {
      continue;
    }

    addStudentByTier(nonPickupStudentsByTier, student);
    addedNonPickupStudentUids.add(student.uid);
  }

  return {
    recruitmentGroupUid: recruitmentGroup.uid,
    recruitmentType: recruitmentGroup.recruitmentType,
    startAt: new Date(recruitmentGroup.startAt).toISOString(),
    pickupStudents,
    nonPickupStudentsByTier,
  };
}

export function buildRecruitmentPoolSnapshotFromBaql({
  recruitmentGroup,
  students,
}: {
  recruitmentGroup: BaqlRecruitmentGroup;
  students: BaqlRecruitmentPoolStudent[];
}): RecruitmentPoolSnapshot {
  return buildRecruitmentPoolSnapshot({
    recruitmentGroup: toPoolGroupFromBaql(recruitmentGroup),
    students: students.map(toPoolStudentFromBaql),
  });
}

function getActivePickupStudents(snapshot: RecruitmentPoolSnapshot, activePickupStudentUid: string | null) {
  if (!activePickupStudentUid) {
    return [];
  }

  return snapshot.pickupStudents.filter((student) => student.uid === activePickupStudentUid);
}

export function createDefaultRecruitmentRateTable(
  snapshot: RecruitmentPoolSnapshot,
  activePickupStudentUid: string | null,
): RecruitmentRateTable {
  const tier3Rate = isFesRecruitmentType(snapshot.recruitmentType) ? 0.06 : 0.03;
  const tier2Rate = 0.185;
  const pickupRates = Object.fromEntries(
    getActivePickupStudents(snapshot, activePickupStudentUid).map((student) => [
      student.uid,
      student.initialTier === 2 ? DEFAULT_PICKUP_STUDENT_RATE_BY_TIER.tier2 : DEFAULT_PICKUP_STUDENT_RATE_BY_TIER.tier3,
    ]),
  );

  return {
    normalSlot: {
      tier1: rate(1 - tier3Rate - tier2Rate),
      tier2: tier2Rate,
      tier3: tier3Rate,
    },
    guaranteedSlot: {
      tier1: 0,
      tier2: 1 - tier3Rate,
      tier3: tier3Rate,
    },
    pickupRates,
  };
}

function getStudentsByTier(snapshot: RecruitmentPoolSnapshot, initialTier: number) {
  if (initialTier === 1) {
    return snapshot.nonPickupStudentsByTier.tier1;
  }
  if (initialTier === 2) {
    return snapshot.nonPickupStudentsByTier.tier2;
  }
  if (initialTier === 3) {
    return snapshot.nonPickupStudentsByTier.tier3;
  }
  return [];
}

function getNonPickupStudentsByTier(
  snapshot: RecruitmentPoolSnapshot,
  initialTier: number,
  activePickupStudentUid: string | null,
) {
  const activePickupStudentUids = new Set(
    getActivePickupStudents(snapshot, activePickupStudentUid).map(({ uid }) => uid),
  );

  return getStudentsByTier(snapshot, initialTier).filter((student) => !activePickupStudentUids.has(student.uid));
}

function pickRandomStudent(students: SimulationStudent[], random: () => number): SimulationStudent {
  if (students.length === 0) {
    throw new Error("No recruitable students for selected rarity");
  }

  const index = Math.min(students.length - 1, Math.floor(random() * students.length));
  return students[index];
}

function pickPickupStudent(
  pickupStudents: SimulationStudent[],
  pickupRates: Record<string, number>,
  totalRarityRate: number,
  random: () => number,
): SimulationStudent | null {
  if (pickupStudents.length === 0 || totalRarityRate <= 0) {
    return null;
  }

  const roll = random() * totalRarityRate;
  let cursor = 0;
  for (const student of pickupStudents) {
    cursor += pickupRates[student.uid] ?? 0;
    if (roll < cursor) {
      return student;
    }
  }
  return null;
}

function hasRecruitableStudent(
  snapshot: RecruitmentPoolSnapshot,
  rarity: 1 | 2 | 3,
  pickupRates: Record<string, number>,
  activePickupStudentUid: string | null,
): boolean {
  return (
    getActivePickupStudents(snapshot, activePickupStudentUid).some(
      (student) => student.initialTier === rarity && (pickupRates[student.uid] ?? 0) > 0,
    ) || getNonPickupStudentsByTier(snapshot, rarity, activePickupStudentUid).length > 0
  );
}

function normalizeSlotRate(
  snapshot: RecruitmentPoolSnapshot,
  slotRate: RecruitmentSlotRate,
  pickupRates: Record<string, number>,
  activePickupStudentUid: string | null,
): RecruitmentSlotRate {
  const availableSlotRate = {
    tier1: hasRecruitableStudent(snapshot, 1, pickupRates, activePickupStudentUid) ? slotRate.tier1 : 0,
    tier2: hasRecruitableStudent(snapshot, 2, pickupRates, activePickupStudentUid) ? slotRate.tier2 : 0,
    tier3: hasRecruitableStudent(snapshot, 3, pickupRates, activePickupStudentUid) ? slotRate.tier3 : 0,
  };
  const totalRate = availableSlotRate.tier1 + availableSlotRate.tier2 + availableSlotRate.tier3;

  if (totalRate <= 0) {
    throw new Error("No recruitable students for selected recruitment");
  }

  return {
    tier1: availableSlotRate.tier1 / totalRate,
    tier2: availableSlotRate.tier2 / totalRate,
    tier3: availableSlotRate.tier3 / totalRate,
  };
}

function drawRecruitmentSlot({
  snapshot,
  slotRate,
  pickupRates,
  activePickupStudentUid,
  random,
}: {
  snapshot: RecruitmentPoolSnapshot;
  slotRate: RecruitmentSlotRate;
  pickupRates: Record<string, number>;
  activePickupStudentUid: string | null;
  random: () => number;
}): RecruitmentDrawResult {
  const effectiveSlotRate = normalizeSlotRate(snapshot, slotRate, pickupRates, activePickupStudentUid);
  const rarityRoll = random();
  const rarity: 1 | 2 | 3 =
    rarityRoll < effectiveSlotRate.tier3 ? 3 : rarityRoll < effectiveSlotRate.tier3 + effectiveSlotRate.tier2 ? 2 : 1;
  const rarityRate =
    rarity === 3 ? effectiveSlotRate.tier3 : rarity === 2 ? effectiveSlotRate.tier2 : effectiveSlotRate.tier1;
  const pickupStudent = pickPickupStudent(
    getActivePickupStudents(snapshot, activePickupStudentUid).filter((student) => student.initialTier === rarity),
    pickupRates,
    rarityRate,
    random,
  );

  if (pickupStudent) {
    return {
      rarity,
      pickup: true,
      student: pickupStudent,
    };
  }

  const student = pickRandomStudent(
    getNonPickupStudentsByTier(snapshot, rarity, activePickupStudentUid),
    random,
  );
  return {
    rarity,
    pickup: false,
    student,
  };
}

export function drawRecruitmentTenPull({
  snapshot,
  activePickupStudentUid,
  rateTable,
  random = Math.random,
}: DrawRecruitmentTenPullArgs): RecruitmentDrawResult[] {
  if (activePickupStudentUid === undefined) {
    throw new Error("activePickupStudentUid is required");
  }

  const effectiveRateTable = rateTable ?? createDefaultRecruitmentRateTable(snapshot, activePickupStudentUid);

  return Array.from({ length: 10 }, (_, index) => {
    const guaranteedSlot = index === 9;

    return drawRecruitmentSlot({
      snapshot,
      slotRate: guaranteedSlot ? effectiveRateTable.guaranteedSlot : effectiveRateTable.normalSlot,
      pickupRates: effectiveRateTable.pickupRates,
      activePickupStudentUid,
      random,
    });
  });
}
