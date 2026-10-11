export type Change = { key: string; group: string; label: string; before: unknown; after: unknown };

const currentFields: Array<{ key: string; label: string }> = [
  { key: "level", label: "학생 레벨" },
  { key: "skillEx", label: "EX 스킬" },
  { key: "skillNormal", label: "기본 스킬" },
  { key: "skillEnhanced", label: "강화 스킬" },
  { key: "skillSub", label: "서브 스킬" },
  { key: "equip1", label: "장비 1 티어" },
  { key: "equip2", label: "장비 2 티어" },
  { key: "equip3", label: "장비 3 티어" },
  { key: "equip1Level", label: "장비 1 레벨" },
  { key: "equip2Level", label: "장비 2 레벨" },
  { key: "equip3Level", label: "장비 3 레벨" },
  { key: "equipSpecial", label: "애용품 티어" },
  { key: "weaponLevel", label: "고유무기 레벨" },
  { key: "abilityHp", label: "HP 해방" },
  { key: "abilityAtk", label: "공격력 해방" },
  { key: "abilityHeal", label: "치유력 해방" },
];
const goalFields: Array<{ key: string; label: string }> = [
  { key: "targetLevel", label: "학생 레벨" },
  { key: "targetSkillEx", label: "EX 스킬" },
  { key: "targetSkillNormal", label: "기본 스킬" },
  { key: "targetSkillEnhanced", label: "강화 스킬" },
  { key: "targetSkillSub", label: "서브 스킬" },
  { key: "targetEquip1", label: "장비 1 티어" },
  { key: "targetEquip2", label: "장비 2 티어" },
  { key: "targetEquip3", label: "장비 3 티어" },
  { key: "targetEquipSpecial", label: "애용품 티어" },
  { key: "targetWeaponLevel", label: "고유무기 레벨" },
  { key: "targetAbilityHp", label: "HP 해방" },
  { key: "targetAbilityAtk", label: "공격력 해방" },
  { key: "targetAbilityHeal", label: "치유력 해방" },
];

export function getChangedValues(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Change[] {
  const beforeValues = flattenSnapshot(before);
  const afterValues = flattenSnapshot(after);
  const changes: Change[] = [];
  const add = (key: string, group: string, label: string, beforeValue: unknown, afterValue: unknown) => {
    const normalizedBefore = normalizeAuditValue(key, beforeValue);
    const normalizedAfter = normalizeAuditValue(key, afterValue);
    if (JSON.stringify(normalizedBefore) === JSON.stringify(normalizedAfter)) return;
    changes.push({ key, group, label, before: normalizedBefore, after: normalizedAfter });
  };

  const beforeRecruited = recruitmentStatus(before);
  const afterRecruited = recruitmentStatus(after);
  if (beforeRecruited !== undefined && afterRecruited !== undefined) {
    add("recruited", "모집 여부", "모집 상태", beforeRecruited, afterRecruited);
  }

  add("tier", "현재 성장도", "성급", beforeValues.current.tier, afterValues.current.tier);
  add("weaponTier", "현재 성장도", "고유무기 성급", beforeValues.current.weaponTier, afterValues.current.weaponTier);
  for (const field of currentFields)
    add(field.key, "현재 성장도", field.label, beforeValues.current[field.key], afterValues.current[field.key]);
  add("bond", "현재 인연", "인연 랭크", beforeValues.current.bond, afterValues.current.bond);
  add("bondExp", "현재 인연", "인연 경험치", beforeValues.current.bondExp, afterValues.current.bondExp);
  add("targetTier", "육성 목표", "성급", beforeValues.target.targetTier, afterValues.target.targetTier);
  add(
    "targetWeaponTier",
    "육성 목표",
    "고유무기 성급",
    beforeValues.target.targetWeaponTier,
    afterValues.target.targetWeaponTier,
  );
  for (const field of goalFields)
    add(field.key, "육성 목표", field.label, beforeValues.target[field.key], afterValues.target[field.key]);
  add(
    "relationshipTargetLevel",
    "육성 목표",
    "인연 랭크",
    beforeValues.target.relationshipTargetLevel,
    afterValues.target.relationshipTargetLevel,
  );
  const beforePlan = beforeValues.target.giftPlan;
  const afterPlan = afterValues.target.giftPlan;
  const beforeGifts = asRecord(beforePlan ?? {});
  const afterGifts = asRecord(afterPlan ?? {});
  if (beforeGifts && afterGifts) {
    const giftUids = new Set([...Object.keys(beforeGifts), ...Object.keys(afterGifts)]);
    for (const uid of giftUids) {
      add(`gift:${uid}`, "선물 계획", uid, beforeGifts[uid] ?? 0, afterGifts[uid] ?? 0);
    }
  } else {
    add("giftPlan", "선물 계획", "선물", beforePlan, afterPlan);
  }
  return changes;
}

type SnapshotValues = { current: Record<string, unknown>; target: Record<string, unknown> };

function flattenSnapshot(snapshot: Record<string, unknown> | null): SnapshotValues {
  const empty = (): SnapshotValues => ({ current: {}, target: {} });
  if (!snapshot) return empty();
  const canonicalState = asRecord(snapshot.state);
  const canonicalTarget = asRecord(snapshot.target);
  if (canonicalState || canonicalTarget) {
    const current = { ...(canonicalState ?? {}) };
    if (typeof current.tier === "number") {
      current.internalTier = current.tier;
      current.weaponTier = Math.max(0, current.tier - 5);
      current.tier = Math.min(current.tier, 5);
    }
    if (Object.hasOwn(current, "relationshipCurrentLevel")) current.bond = current.relationshipCurrentLevel;
    if (Object.hasOwn(current, "relationshipCurrentExp")) current.bondExp = current.relationshipCurrentExp;
    const target = { ...(canonicalTarget ?? {}) };
    if (typeof target.targetTier === "number") {
      target.internalTargetTier = target.targetTier;
      target.targetWeaponTier = Math.max(0, target.targetTier - 5);
      target.targetTier = Math.min(target.targetTier, 5);
    }
    if (Object.hasOwn(target, "targetBond")) target.relationshipTargetLevel = target.targetBond;
    return { current, target };
  }

  const recruited = asRecord(snapshot.recruited) ?? {};
  const growth = asRecord(snapshot.growth) ?? {};
  const relationship = asRecord(snapshot.relationship) ?? {};
  const current = { ...recruited };
  if (typeof current.tier === "number") {
    current.internalTier = current.tier;
    current.weaponTier = Math.max(0, current.tier - 5);
    current.tier = Math.min(current.tier, 5);
  }
  if (Object.hasOwn(relationship, "currentLevel")) current.bond = relationship.currentLevel;
  if (Object.hasOwn(relationship, "currentExp")) current.bondExp = relationship.currentExp;
  const target = { ...growth };
  if (typeof target.targetTier === "number") {
    target.internalTargetTier = target.targetTier;
    target.targetWeaponTier = Math.max(0, target.targetTier - 5);
    target.targetTier = Math.min(target.targetTier, 5);
  }
  if (Object.hasOwn(relationship, "targetLevel")) target.relationshipTargetLevel = relationship.targetLevel;
  if (Object.hasOwn(relationship, "items")) target.giftPlan = relationship.items;
  return { current, target };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAuditValue(key: string, value: unknown): unknown {
  if (value !== undefined && value !== null) return value;
  return key === "giftPlan" ? {} : null;
}

function recruitmentStatus(snapshot: Record<string, unknown> | null): boolean | undefined {
  if (!snapshot) return false;
  const state = asRecord(snapshot.state);
  if (state && Object.hasOwn(state, "recruitedAt")) return state.recruitedAt != null;
  if (Object.hasOwn(snapshot, "state") && snapshot.state === null) return false;
  if (Object.hasOwn(snapshot, "recruited")) return asRecord(snapshot.recruited) !== null;
  return undefined;
}
