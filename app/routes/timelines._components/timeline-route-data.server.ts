import type { GuideBody, GuideBodyInline, GuideBodyListItemBlock } from "~/domain/guide-body";
import {
  WALKTHROUGH_TIMELINE_DEFENSE_TYPES,
  WALKTHROUGH_TIMELINE_TERRAINS,
  type WalkthroughTimelineDefenseType,
  type WalkthroughTimelineDocument,
  type WalkthroughTimelineTerrain,
} from "~/domain/walkthrough-timeline";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents, type Student } from "~/models/student";

// The student fields the 공략/타임라인 screens use: the name and its other names for search, the role for the slot it
// can take, and the initial tier and equipment slots for the growth table.
export type WalkthroughRouteStudent = {
  uid: string;
  name: string;
  // Matched by the community text import, as an alias.
  familyName: string | null;
  altNames: string[];
  role: "striker" | "special";
  initialTier: number;
  equipmentSlots: number;
  // For the 1.x viewer, which labels equipment by kind.
  equipments: string[];
};

export function toWalkthroughRouteStudent(student: Student): WalkthroughRouteStudent {
  return {
    uid: student.uid,
    name: student.name,
    familyName: student.familyName,
    altNames: student.altNames,
    role: student.role,
    initialTier: student.initialTier,
    equipmentSlots: student.equipments.length,
    equipments: student.equipments,
  };
}

function inlineStudentUids(content: GuideBodyInline[] | undefined): string[] {
  return (content ?? []).flatMap((node) =>
    node.type === "mention" && node.attrs.kind === "student" ? [node.attrs.id] : [],
  );
}

function blockStudentUids(block: GuideBody["content"][number] | GuideBodyListItemBlock): string[] {
  if (block.type === "paragraph" || block.type === "heading") return inlineStudentUids(block.content);
  if (block.type === "bulletList" || block.type === "orderedList") {
    return block.content.flatMap((item) => item.content.flatMap(blockStudentUids));
  }
  return [];
}

// Every student a guide shows: its formation, its timeline actions, and the students its body mentions.
export function walkthroughReferencedStudentUids(
  document: Pick<WalkthroughTimelineDocument, "parties">,
  body: GuideBody | null,
): Set<string> {
  const uids = new Set<string>();
  for (const party of document.parties) {
    for (const unit of party.units) if (unit.studentUid) uids.add(unit.studentUid);
    for (const uid of party.startingSkillStudentUids) uids.add(uid);
    for (const step of party.steps) {
      for (const action of step.actions) {
        if (action.studentUid) uids.add(action.studentUid);
        if (action.targetStudentUid) uids.add(action.targetStudentUid);
      }
    }
  }
  for (const block of body?.content ?? []) for (const uid of blockStudentUids(block)) uids.add(uid);
  return uids;
}

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
    students: students.map(toWalkthroughRouteStudent),
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
