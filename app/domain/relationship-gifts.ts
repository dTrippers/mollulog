import { getAccumulatedRelationshipExpForLevel, RELATIONSHIP_EXP_TABLE } from "./relationship-level";

export type StudentFavoriteGift = {
  favorited: boolean;
  favoriteLevel: number;
  exp: number;
  item: { uid: string; name: string; rarity: number };
};

export type RelationshipGiftExpGroup = {
  exp: number;
  gifts: StudentFavoriteGift[];
};

export type RelationshipShortfallRow = RelationshipGiftExpGroup & { quantity: number };

export type RelationshipGiftQuantityBreakdown = {
  requiredQuantities: Record<string, number>;
  breakdowns: Record<string, Array<{ studentUid: string; name: string; quantity: number }>>;
};

export function groupStudentGiftsByExp(favoriteItems: readonly StudentFavoriteGift[]): RelationshipGiftExpGroup[] {
  const groups = new Map<number, StudentFavoriteGift[]>();
  for (const favoriteItem of favoriteItems) {
    if (favoriteItem.exp <= 0) continue;
    if (favoriteItem.exp !== 40 && (favoriteItem.favoriteLevel < 3 || favoriteItem.favoriteLevel > 4)) continue;
    const gifts = groups.get(favoriteItem.exp) ?? [];
    gifts.push(favoriteItem);
    groups.set(favoriteItem.exp, gifts);
  }

  return [...groups]
    .sort(([expA], [expB]) => expB - expA)
    .map(([exp, gifts]) => ({
      exp,
      gifts: gifts.sort((a, b) => b.item.rarity - a.item.rarity || Number(a.item.uid) - Number(b.item.uid)),
    }));
}

export function convertRelationshipShortfall(
  remainingExp: number,
  giftsByExp: readonly RelationshipGiftExpGroup[],
): RelationshipShortfallRow[] {
  if (remainingExp <= 0) return [];
  return giftsByExp.map((group) => ({ ...group, quantity: Math.ceil(remainingExp / group.exp) }));
}

export function getAvailableOwnedGiftQuantities(
  ownedQuantities: Record<string, number>,
  breakdowns: RelationshipGiftQuantityBreakdown["breakdowns"],
  currentStudentUid: string,
  excludeOtherStudents: boolean,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(ownedQuantities).map(([itemUid, ownedQuantity]) => {
      const allocatedToOthers = excludeOtherStudents
        ? (breakdowns[itemUid] ?? [])
            .filter((entry) => entry.studentUid !== currentStudentUid)
            .reduce((total, entry) => total + entry.quantity, 0)
        : 0;
      return [itemUid, Math.max(ownedQuantity - allocatedToOthers, 0)];
    }),
  );
}

export function getOwnedGiftPlanQuantities(
  favoriteItems: readonly Pick<StudentFavoriteGift, "item">[] | null | undefined,
  ownedQuantities: Record<string, number> | null,
): Record<string, number> {
  if (!favoriteItems || !ownedQuantities) return {};
  return Object.fromEntries(
    favoriteItems
      .map(({ item }) => [item.uid, ownedQuantities[item.uid] ?? 0] as const)
      .filter(([, quantity]) => quantity > 0),
  );
}

export function getRelationshipGiftQuantityBreakdown(
  students: readonly { uid: string; name: string; items: Record<string, number> }[],
): RelationshipGiftQuantityBreakdown {
  const requiredQuantities: Record<string, number> = {};
  const breakdowns: RelationshipGiftQuantityBreakdown["breakdowns"] = {};
  for (const student of students) {
    for (const [itemUid, quantity] of Object.entries(student.items)) {
      if (quantity <= 0) continue;
      requiredQuantities[itemUid] = (requiredQuantities[itemUid] ?? 0) + quantity;
      breakdowns[itemUid] = [...(breakdowns[itemUid] ?? []), { studentUid: student.uid, name: student.name, quantity }];
    }
  }
  for (const entries of Object.values(breakdowns)) {
    entries.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "ko"));
  }
  return { requiredQuantities, breakdowns };
}

export function getRelationshipLevelForExp(exp: number): number {
  const nextLevel = RELATIONSHIP_EXP_TABLE.find((entry) => entry.accumulatedExp > exp);
  return nextLevel ? nextLevel.level - 1 : (RELATIONSHIP_EXP_TABLE.at(-1)?.level ?? 100);
}

export function getRelationshipShortfallSummary(input: {
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  giftExp: number;
}) {
  if (input.currentLevel == null || input.targetLevel == null) return null;
  const currentExp = input.currentExp ?? getAccumulatedRelationshipExpForLevel(input.currentLevel);
  const expectedExp = currentExp + input.giftExp;
  const expectedLevel = getRelationshipLevelForExp(expectedExp);
  const remainingExp = getAccumulatedRelationshipExpForLevel(input.targetLevel) - expectedExp;
  const nextRankExp =
    expectedLevel >= 100 ? null : getAccumulatedRelationshipExpForLevel(expectedLevel + 1) - expectedExp;
  return {
    expectedExp,
    expectedLevel,
    nextRankExp,
    remainingExp: Math.max(remainingExp, 0),
    excessExp: Math.max(-remainingExp, 0),
    reached: remainingExp <= 0,
  };
}
