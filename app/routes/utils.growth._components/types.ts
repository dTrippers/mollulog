import type { GrowthSortOrder } from "~/domain/growth-planner";
import type { StudentGrowthResourceRequirements } from "~/domain/growth-resource";

export type GrowthActionResult =
  | { kind: "studentUpdate"; student: GrowthStudent; submissionId?: string }
  | { kind: "listChange"; requiresRevalidation: true }
  | { kind: "sortOrder"; sortOrder: GrowthSortOrder }
  | { kind: "order"; orderedStudentUids: string[] }
  | { error: string; code?: string; retryable?: boolean };

export type GrowthStudent = {
  uid: string;
  name: string;
  order: number;
  plannerCreatedAt: string | null;
  // The manual order, ascending from the top. Null sits above every positioned student.
  plannerPosition: number | null;
  isRecruited: boolean;
  released: boolean;
  hasGear: boolean;
  equipments: string[];
  tier: number | null;
  initialTier: number;
  relationshipCurrentLevel: number | null;
  relationshipTargetLevel: number | null;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  weaponLevel: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
  targetLevel: number | null;
  targetWeaponLevel: number | null;
  targetAbilityHp: number | null;
  targetAbilityAtk: number | null;
  targetAbilityHeal: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  targetTier: number | null;
  resourceRequirements: StudentGrowthResourceRequirements | null;
};

export type GrowthAvailableStudent = {
  uid: string;
  name: string;
};

export type GrowthLayoutLoaderData = {
  managedStudents: GrowthStudent[];
  availableStudents: GrowthAvailableStudent[];
};

export type GrowthResourceRequirementsByStudent = Record<string, StudentGrowthResourceRequirements>;

export type DeferredGrowthLayoutLoaderData = GrowthLayoutLoaderData & {
  sortOrder: GrowthSortOrder;
  // The account has a stored sort choice; without one the default order applies.
  sortOrderStored: boolean;
  resourceRequirements: Promise<GrowthResourceRequirementsByStudent>;
};

export type GrowthLayoutContext = GrowthLayoutLoaderData & {
  sortOrder: GrowthSortOrder;
  sortOrderStored: boolean;
  updateStudent: (student: GrowthStudent) => void;
  setStudentPositions: (positions: Record<string, number | null>) => void;
  // The V2Page layout is stacked (one column with group tabs).
  stacked: boolean;
  farmingStageFilter?: {
    showNormal: boolean;
    showHard: boolean;
    prioritizeHighTier: boolean;
  };
};
