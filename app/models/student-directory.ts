import { graphql } from "~/graphql";
import type { StudentDirectoryQuery, StudentTerrainAdaptationRank } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "~/lib/cache";
import type { Student } from "./student";

/**
 * The public fields that the student directory is allowed to request and
 * expose. Keep this contract separate from the all-students query because the
 * directory can grow without changing the shared list used by other screens.
 */
export type StudentDirectoryProfile = {
  age: string | null;
  schoolYear: string | null;
  height: string | null;
};

export type StudentDirectoryTerrainAdaptations = {
  street: StudentTerrainAdaptationRank;
  outdoor: StudentTerrainAdaptationRank;
  indoor: StudentTerrainAdaptationRank;
};

export type StudentDirectoryStudent = Student & {
  catalog: {
    profile: StudentDirectoryProfile;
    terrainAdaptations: StudentDirectoryTerrainAdaptations;
  } | null;
};

export type StudentDirectoryGroupBy = "none" | "school" | "attackType" | "defenseType" | "role" | "position";

export type StudentDirectoryDisplayField =
  | "none"
  | "school"
  | "attackType"
  | "defenseType"
  | "role"
  | "tacticRole"
  | "position"
  | "equipment1"
  | "equipment2"
  | "equipment3"
  | "initialTier"
  | "age"
  | "schoolYear"
  | "height"
  | "street"
  | "outdoor"
  | "indoor";

const studentDirectoryQuery = graphql(`
  query StudentDirectory {
    students {
      uid
      name
      familyName
      altNames
      school
      initialTier
      order
      attackType
      defenseType
      position
      tacticRole
      birthday
      role
      equipments
      released
      catalog {
        profile {
          age
          schoolYear
          height
        }
        terrainAdaptations {
          street
          outdoor
          indoor
        }
      }
    }
  }
`);

const STUDENT_DIRECTORY_CACHE_KEY = cacheKey("source", "student-directory", 1, "all");

function normalizeStudentDirectoryStudent(student: StudentDirectoryQuery["students"][number]): StudentDirectoryStudent {
  return {
    uid: student.uid,
    name: student.name,
    familyName: student.familyName ?? null,
    altNames: student.altNames,
    school: student.school,
    initialTier: student.initialTier,
    order: student.order,
    attackType: student.attackType,
    defenseType: student.defenseType,
    position: student.position,
    tacticRole: student.tacticRole,
    birthday: student.birthday,
    role: student.role,
    equipments: student.equipments,
    released: student.released,
    catalog: student.catalog
      ? {
          profile: {
            age: student.catalog.profile.age ?? null,
            schoolYear: student.catalog.profile.schoolYear ?? null,
            height: student.catalog.profile.height ?? null,
          },
          terrainAdaptations: {
            street: student.catalog.terrainAdaptations.street,
            outdoor: student.catalog.terrainAdaptations.outdoor,
            indoor: student.catalog.terrainAdaptations.indoor,
          },
        }
      : null,
  };
}

async function fetchStudentDirectoryFromBaql(): Promise<StudentDirectoryStudent[]> {
  const result = await runQuery(studentDirectoryQuery, {});
  if (result.error) {
    throw result.error;
  }
  if (!result.data || !Array.isArray(result.data.students)) {
    throw new Error("BAQL student directory response is missing students");
  }

  return result.data.students.map(normalizeStudentDirectoryStudent);
}

export async function syncStudentDirectory(env: Env, forceRefresh = true): Promise<StudentDirectoryStudent[]> {
  return fetchSourceCached(env, STUDENT_DIRECTORY_CACHE_KEY, fetchStudentDirectoryFromBaql, forceRefresh, {
    rejectOnForcedRefresh: true,
  });
}

export async function getStudentDirectoryStudents(
  env: Env,
  includeUnreleased = false,
): Promise<StudentDirectoryStudent[]> {
  const students = await fetchSourceCached(env, STUDENT_DIRECTORY_CACHE_KEY, fetchStudentDirectoryFromBaql, false);
  return includeUnreleased ? students : students.filter(({ released }) => released);
}
