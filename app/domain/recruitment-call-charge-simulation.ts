import {
  createDefaultRecruitmentRateTable,
  drawRecruitmentSingleSlot,
  type RecruitmentDrawResult,
  type RecruitmentPoolSnapshot,
} from "~/domain/recruitment-simulator";

export type CallChargeTenPullResult = {
  results: RecruitmentDrawResult[];
  charge: number;
};

function drawNonPickupThreeStar(
  snapshot: RecruitmentPoolSnapshot,
  activePickupStudentUid: string,
  random: () => number,
): RecruitmentDrawResult {
  const pool = snapshot.nonPickupStudentsByTier.tier3.filter((student) => student.uid !== activePickupStudentUid);
  if (pool.length === 0) throw new Error("No non-pickup three-star students for call-charge simulation");
  const student = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (!student) throw new Error("No non-pickup three-star students for call-charge simulation");
  return { rarity: 3, pickup: false, student };
}

export function simulateCallChargeTenPull({
  snapshot,
  activePickupStudentUid,
  startingCharge,
  random = Math.random,
}: {
  snapshot: RecruitmentPoolSnapshot;
  activePickupStudentUid: string;
  startingCharge: number;
  random?: () => number;
}): CallChargeTenPullResult {
  const pickup = snapshot.pickupStudents.find((student) => student.uid === activePickupStudentUid);
  if (!pickup) throw new Error("Active pickup student is missing from the recruitment snapshot");

  const rateTable = createDefaultRecruitmentRateTable(snapshot, activePickupStudentUid);
  const results: RecruitmentDrawResult[] = [];
  let charge = startingCharge;

  for (let slot = 0; slot < 10; slot += 1) {
    charge += 1;
    let result: RecruitmentDrawResult;
    if (charge === 100) {
      result =
        random() < 0.5
          ? { rarity: 3, pickup: true, student: pickup }
          : drawNonPickupThreeStar(snapshot, activePickupStudentUid, random);
    } else if (charge === 200) {
      result = { rarity: 3, pickup: true, student: pickup };
    } else {
      result = drawRecruitmentSingleSlot({
        snapshot,
        activePickupStudentUid,
        rateTable,
        guaranteed: slot === 9,
        random,
      });
    }

    results.push(result);
    if (result.pickup && result.student.uid === activePickupStudentUid) charge = 0;
  }

  return { results, charge };
}
