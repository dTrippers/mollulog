import { isStudentReleased } from "~/domain/student-release";
import { graphql } from "~/graphql";
import type { StudentDirectoryQuery, StudentTerrainAdaptationRank } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, fetchSourceCached } from "~/lib/cache";
import { toUtcIso } from "~/lib/date-time";
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
  releaseAt: string | null;
  weaponType: string | null;
  acquisitionType: string | null;
  canUseCover: boolean | null;
  skillEffectTags: string[] | null;
  club: { uid: string; name: string | null } | null;
  studentVariant: { primaryStudent: { uid: string } } | null;
  catalog: {
    profile: StudentDirectoryProfile;
    terrainAdaptations: StudentDirectoryTerrainAdaptations;
  } | null;
};

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
      releaseAt
      attackType
      defenseType
      weaponType
      acquisitionType(region: gl)
      canUseCover
      skillEffectTags
      club { uid name }
      studentVariant { primaryStudent { uid } }
      position
      tacticRole
      birthday
      role
      equipments
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

/** A directory student as the source cache stores it, without the release state that goes stale. */
type CachedStudentDirectoryStudent = Omit<StudentDirectoryStudent, "released">;

const STUDENT_DIRECTORY_CACHE_KEY = cacheKey("source", "student-directory", 3, "all");

function normalizeStudentDirectoryStudent(
  student: StudentDirectoryQuery["students"][number],
): CachedStudentDirectoryStudent {
  return {
    uid: student.uid,
    name: student.name,
    familyName: student.familyName ?? null,
    altNames: student.altNames,
    school: student.school,
    initialTier: student.initialTier,
    order: student.order,
    releaseAt: student.releaseAt === null ? null : toUtcIso(student.releaseAt),
    attackType: student.attackType,
    defenseType: student.defenseType,
    weaponType: student.weaponType ?? null,
    acquisitionType: student.acquisitionType ?? null,
    canUseCover: student.canUseCover ?? null,
    skillEffectTags: student.skillEffectTags ?? null,
    club: student.club ? { uid: student.club.uid, name: student.club.name ?? null } : null,
    studentVariant: student.studentVariant?.primaryStudent
      ? { primaryStudent: { uid: student.studentVariant.primaryStudent.uid } }
      : null,
    position: student.position,
    tacticRole: student.tacticRole,
    birthday: student.birthday,
    role: student.role,
    equipments: student.equipments,
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

async function fetchStudentDirectoryFromBaql(): Promise<CachedStudentDirectoryStudent[]> {
  const result = await runQuery(studentDirectoryQuery, {});
  if (result.error) {
    throw result.error;
  }
  if (!result.data || !Array.isArray(result.data.students)) {
    throw new Error("BAQL student directory response is missing students");
  }

  return result.data.students.map(normalizeStudentDirectoryStudent);
}

function toStudentDirectoryStudents(
  cachedStudents: CachedStudentDirectoryStudent[],
  now = Date.now(),
): StudentDirectoryStudent[] {
  return cachedStudents.map((student) => ({ ...student, released: isStudentReleased(student.releaseAt, now) }));
}

export async function syncStudentDirectory(env: Env, forceRefresh = true): Promise<StudentDirectoryStudent[]> {
  return toStudentDirectoryStudents(
    await fetchSourceCached(env, STUDENT_DIRECTORY_CACHE_KEY, fetchStudentDirectoryFromBaql, forceRefresh, {
      rejectOnForcedRefresh: true,
    }),
  );
}

export async function getStudentDirectoryStudents(
  env: Env,
  includeUnreleased = false,
): Promise<StudentDirectoryStudent[]> {
  const students = toStudentDirectoryStudents(
    await fetchSourceCached(env, STUDENT_DIRECTORY_CACHE_KEY, fetchStudentDirectoryFromBaql, false),
  );
  return includeUnreleased ? students : students.filter(({ released }) => released);
}
