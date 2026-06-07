import type { StudentGrowthResourceRequirements } from "~/models/growth-resource";

export type GrowthActionResult =
  | { kind: "studentUpdate"; student: GrowthStudent; submissionId?: string }
  | { kind: "listChange"; requiresRevalidation: true }
  | { error: string };

export type GrowthStudent = {
  uid: string;
  name: string;
  order: number;
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
  targetLevel: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  targetTier: number | null;
  resourceRequirements: StudentGrowthResourceRequirements;
};

export type GrowthAvailableStudent = {
  uid: string;
  name: string;
};

export type GrowthLayoutLoaderData = {
  managedStudents: GrowthStudent[];
  availableStudents: GrowthAvailableStudent[];
};

export type GrowthLayoutContext = GrowthLayoutLoaderData & {
  updateStudent: (student: GrowthStudent) => void;
  farmingStageFilter?: {
    showNormal: boolean;
    showHard: boolean;
    prioritizeHighTier: boolean;
  };
};
