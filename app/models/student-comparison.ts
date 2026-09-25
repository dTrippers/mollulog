import type { StudentCalculatorState } from "~/domain/student-calculator";
import { graphql } from "~/graphql";
import type { StudentComparisonQuery } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getStudentDirectoryStudents, type StudentDirectoryStudent } from "~/models/student-directory";

const studentComparisonQuery = graphql(`
  query StudentComparison($uids: [String!]) {
    studentCatalog {
      version
      statLevelInterpolationEndLevel
      statLevelInterpolations {
        level
        ratios { growthType value }
      }
      equipment {
        uid
        category
        tier
        maxLevel
        growthType
        name
        modifiers { stat kind level1 levelMax }
      }
    }
    selectedStudents: students(uids: $uids) {
      name familyName uid attackType defenseType role school
      initialTier position tacticRole equipments
      character {
        uid
        studentVariants {
          uid
          isMulticlass
          primaryStudent {
            uid name position tacticRole
            catalog {
              favorRewards { level modifiers { stat kind value } }
            }
          }
          students { uid name position tacticRole }
        }
      }
      studentVariant {
        uid
        isMulticlass
        primaryStudent { uid name }
        students { uid name position tacticRole }
      }
      catalog {
        profile {
          familyName personalName introduction hobby age schoolYear height weaponName
        }
        statProfile {
          growthType
          levelStats { stat level1 level100 }
          fixedStats { stat value }
        }
        terrainAdaptations { street outdoor indoor }
        starBonuses { star modifiers { stat kind value } }
        potentialBonuses { stat levels { level rate } }
        favorRewards { level modifiers { stat kind value } }
        weapon {
          name description imageUrl growthType
          levelStats { stat level1 level100 }
          stages {
            stage unlocked maxLevel learnSkillSlot learnSkillPosition
            modifiers { stat kind value }
          }
        }
        gear {
          name description
          tiers {
            tier openFavorLevel maxLevel growthType learnSkillSlot learnSkillPosition
            modifiers { stat kind level1 levelMax }
          }
        }
        skillConfigurations {
          formIndex minimumWeaponStar minimumGearTier selectExSkillActionSlot
          slots { slot skills { position skillUid } }
        }
      }
      skills(includeVariants: true) {
        uid skillType name iconUrl maxLevel
        levels {
          level cost
          statModifiers { stat kind value activation persistence }
        }
        description {
          template
          parameters {
            id emphasized
            values { level text }
          }
        }
        additionalSkillUids
        selectableSkills { condition skillUid }
      }
    }
  }
`);

export type StudentComparisonDirectoryStudent = StudentDirectoryStudent;
export type StudentComparisonStudent = StudentComparisonQuery["selectedStudents"][number];
export type StudentComparisonCatalog = StudentComparisonQuery["studentCatalog"];

export type StudentComparisonData = {
  students: StudentComparisonDirectoryStudent[];
  selectedStudents: StudentComparisonStudent[];
  catalog: StudentComparisonCatalog;
};

export type StudentComparisonSavedGrowth = StudentCalculatorState;

export async function getStudentComparisonData(
  env: Env,
  selectedUids: readonly string[],
): Promise<StudentComparisonData> {
  const uniqueUids = [...new Set(selectedUids)];
  const [directoryStudents, comparisonResult] = await Promise.all([
    getStudentDirectoryStudents(env, true),
    uniqueUids.length > 0 ? runQuery(studentComparisonQuery, { uids: uniqueUids }) : Promise.resolve(null),
  ]);

  if (comparisonResult?.error) throw comparisonResult.error;
  if (uniqueUids.length > 0 && (!comparisonResult?.data || !Array.isArray(comparisonResult.data.selectedStudents))) {
    throw new Error("학생 비교 자료를 불러오지 못했어요");
  }

  return {
    students: [...directoryStudents].sort((left, right) => right.order - left.order),
    selectedStudents: comparisonResult?.data?.selectedStudents ?? [],
    catalog: comparisonResult?.data?.studentCatalog ?? null,
  };
}

export async function getStudentComparisonSavedGrowth(
  env: Env,
  senseiId: number,
  primaryStudentUid: string,
): Promise<StudentComparisonSavedGrowth | null> {
  const recruitedStudents = await getRecruitedStudents(env, senseiId, [primaryStudentUid]);
  const recruited = recruitedStudents.find((student) => student.studentUid === primaryStudentUid);
  if (!recruited) return null;

  const relationshipLevels = await getRelationshipLevels(env, senseiId, [primaryStudentUid]);
  const relationship = relationshipLevels.find((level) => level.studentId === primaryStudentUid);
  return {
    level: recruited.level,
    tier: recruited.tier,
    bond: relationship?.currentLevel ?? null,
    skillEx: recruited.skillEx,
    skillNormal: recruited.skillNormal,
    skillEnhanced: recruited.skillEnhanced,
    skillSub: recruited.skillSub,
    equip1: recruited.equip1,
    equip2: recruited.equip2,
    equip3: recruited.equip3,
    equip1Level: recruited.equip1Level ?? null,
    equip2Level: recruited.equip2Level ?? null,
    equip3Level: recruited.equip3Level ?? null,
    equipSpecial: recruited.equipSpecial,
    weaponLevel: recruited.weaponLevel,
    abilityHp: recruited.abilityHp,
    abilityAtk: recruited.abilityAtk,
    abilityHeal: recruited.abilityHeal,
  };
}
