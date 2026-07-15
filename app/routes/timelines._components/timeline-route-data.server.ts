import { WALKTHROUGH_TIMELINE_DEFENSE_TYPES, type WalkthroughTimelineDefenseType } from "~/domain/walkthrough-timeline";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";

export async function loadTimelineEditorOptions(env: Env, userId: number) {
  const [students, raids, recruitedStudents] = await Promise.all([
    getAllStudents(env, true),
    getAllRaidSchedules(env),
    getRecruitedStudents(env, userId),
  ]);
  const bossesByUid = new Map<
    string,
    { uid: string; name: string; defenseTypes: Set<WalkthroughTimelineDefenseType>; scheduleKeys: string[] }
  >();
  for (const raid of raids) {
    const boss = bossesByUid.get(raid.raidBoss.uid) ?? {
      uid: raid.raidBoss.uid,
      name: raid.raidBoss.name,
      defenseTypes: new Set<WalkthroughTimelineDefenseType>(),
      scheduleKeys: [],
    };
    for (const defenseType of raid.defenseTypes) {
      if (WALKTHROUGH_TIMELINE_DEFENSE_TYPES.includes(defenseType.defenseType as WalkthroughTimelineDefenseType)) {
        boss.defenseTypes.add(defenseType.defenseType as WalkthroughTimelineDefenseType);
      }
    }
    boss.scheduleKeys.push(`${raid.raidType}:${raid.seasonIndex}`);
    bossesByUid.set(boss.uid, boss);
  }
  return {
    students: students.map(({ uid, name, familyName, altNames, initialTier, role }) => ({
      uid,
      name,
      familyName,
      altNames,
      initialTier,
      role,
    })),
    bosses: [...bossesByUid.values()]
      .filter((boss) => boss.defenseTypes.size > 0)
      .map((boss) => ({ ...boss, defenseTypes: [...boss.defenseTypes] }))
      .sort((left, right) => left.name.localeCompare(right.name, "ko")),
    recruitedSnapshots: Object.fromEntries(
      recruitedStudents.map(({ uid: _uid, studentUid, ...snapshot }) => [
        studentUid,
        Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== null)),
      ]),
    ),
  };
}
