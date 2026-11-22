import {
  createDefaultRecruitmentRateTable,
  drawRecruitmentSingleSlot,
  type RecruitmentDrawResult,
  type RecruitmentPoolSnapshot,
} from "~/domain/recruitment-simulator";

export const CALL_CHARGE_MIDPOINT = 100;
export const CALL_CHARGE_CEILING = 200;

export type CallChargeAdjustment = typeof CALL_CHARGE_MIDPOINT | typeof CALL_CHARGE_CEILING;

export type CallChargeDrawResult = RecruitmentDrawResult & {
  /** The charge value this slot reached when a charge adjustment decided it; null for normal-rate slots. */
  adjustment: CallChargeAdjustment | null;
  /** Whether this slot granted the active pickup and reset the charge to 0. */
  resetCharge: boolean;
};

export type CallChargeTenPullResult = {
  results: CallChargeDrawResult[];
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
  const pickupRarity = pickup.initialTier;
  if (pickupRarity !== 2 && pickupRarity !== 3) {
    throw new Error("Call-charge simulation supports only two-star or three-star pickups");
  }

  const rateTable = createDefaultRecruitmentRateTable(snapshot, activePickupStudentUid);
  const pickupResult: RecruitmentDrawResult = { rarity: pickupRarity, pickup: true, student: pickup };
  const results: CallChargeDrawResult[] = [];
  let charge = startingCharge;

  for (let slot = 0; slot < 10; slot += 1) {
    charge += 1;
    let result: RecruitmentDrawResult;
    let adjustment: CallChargeAdjustment | null = null;
    if (charge === CALL_CHARGE_MIDPOINT) {
      adjustment = CALL_CHARGE_MIDPOINT;
      result = random() < 0.5 ? pickupResult : drawNonPickupThreeStar(snapshot, activePickupStudentUid, random);
    } else if (charge === CALL_CHARGE_CEILING) {
      adjustment = CALL_CHARGE_CEILING;
      result = pickupResult;
    } else {
      result = drawRecruitmentSingleSlot({
        snapshot,
        activePickupStudentUid,
        rateTable,
        guaranteed: slot === 9,
        random,
      });
    }

    const resetCharge = result.pickup && result.student.uid === activePickupStudentUid;
    results.push({ ...result, adjustment, resetCharge });
    if (resetCharge) charge = 0;
  }

  return { results, charge };
}
