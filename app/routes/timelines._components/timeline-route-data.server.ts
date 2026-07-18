import {
  WALKTHROUGH_TIMELINE_DEFENSE_TYPES,
  WALKTHROUGH_TIMELINE_TERRAINS,
  type WalkthroughTimelineDefenseType,
  type WalkthroughTimelineTerrain,
} from "~/domain/walkthrough-timeline";
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
    {
      uid: string;
      name: string;
      defenseTypes: Set<WalkthroughTimelineDefenseType>;
      terrains: Set<WalkthroughTimelineTerrain>;
      partySizes: Set<6 | 10>;
      schedules: { key: string; terrain: WalkthroughTimelineTerrain }[];
    }
  >();
  for (const raid of raids) {
    if (!["total_assault", "elimination", "unlimit"].includes(raid.raidType)) continue;
    if (!WALKTHROUGH_TIMELINE_TERRAINS.includes(raid.terrain as WalkthroughTimelineTerrain)) continue;
    const boss = bossesByUid.get(raid.raidBoss.uid) ?? {
      uid: raid.raidBoss.uid,
      name: raid.raidBoss.name,
      defenseTypes: new Set<WalkthroughTimelineDefenseType>(),
      terrains: new Set<WalkthroughTimelineTerrain>(),
      partySizes: new Set<6 | 10>(),
      schedules: [],
    };
    for (const defenseType of raid.defenseTypes) {
      if (WALKTHROUGH_TIMELINE_DEFENSE_TYPES.includes(defenseType.defenseType as WalkthroughTimelineDefenseType)) {
        boss.defenseTypes.add(defenseType.defenseType as WalkthroughTimelineDefenseType);
      }
    }
    const terrain = raid.terrain as WalkthroughTimelineTerrain;
    boss.terrains.add(terrain);
    boss.partySizes.add(raid.raidType === "unlimit" ? 10 : 6);
    boss.schedules.push({ key: `${raid.raidType}:${raid.seasonIndex}`, terrain });
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
      .filter((boss) => boss.defenseTypes.size > 0 && boss.terrains.size > 0)
      .map((boss) => {
        if (boss.partySizes.size !== 1) {
          throw new Error(`${boss.name}의 파티 인원 정보를 하나로 결정할 수 없어요.`);
        }
        const [partySize] = boss.partySizes;
        if (!partySize) throw new Error(`${boss.name}의 파티 인원 정보가 없어요.`);
        return {
          uid: boss.uid,
          name: boss.name,
          defenseTypes: [...boss.defenseTypes],
          terrains: [...boss.terrains],
          partySize,
          schedules: boss.schedules,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "ko")),
    recruitedSnapshots: Object.fromEntries(
      recruitedStudents.map(({ uid: _uid, studentUid, ...snapshot }) => [
        studentUid,
        Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== null)),
      ]),
    ),
  };
}
