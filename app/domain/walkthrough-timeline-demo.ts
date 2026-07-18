import type { WalkthroughTimelineRecord } from "./walkthrough-timeline";

export const DEMO_WALKTHROUGH_TIMELINE_UID = "demo";
export const DEMO_WALKTHROUGH_BOSS_NAME = "비나";

export const DEMO_WALKTHROUGH_STUDENT_UIDS = {
  armedAris: "10134",
  swimsuitMika: "10122",
  aru: "10000",
  uniformNeru: "10111",
  swimsuitShiroko: "20027",
  swimsuitNagisa: "20048",
} as const;

const { armedAris, swimsuitMika, aru, uniformNeru, swimsuitShiroko, swimsuitNagisa } = DEMO_WALKTHROUGH_STUDENT_UIDS;

export const DEMO_WALKTHROUGH_TIMELINE = {
  uid: DEMO_WALKTHROUGH_TIMELINE_UID,
  title: "공략 데모",
  description:
    "공략 타임라인 데모 예시입니다. 시작 스킬, 학생 성장도, 여러 시점과 연속 행동, 대상 지정이 어떻게 표시되는지 확인해보세요.",
  visibility: "public",
  bossUid: "binah",
  terrain: "street",
  defenseType: "heavy",
  maxDifficulty: "torment",
  document: {
    type: "walkthrough_timeline",
    schemaVersion: 1,
    partySize: 6,
    context: {
      bossUid: "binah",
      terrain: "street",
      defenseType: "heavy",
      maxDifficulty: "torment",
    },
    parties: [
      {
        uid: "demo-party-1",
        order: 0,
        startingSkillStudentUids: [armedAris, swimsuitMika, aru],
        units: [
          {
            slot: 0,
            studentUid: armedAris,
            snapshot: {
              tier: 8,
              level: 90,
              skillEx: 5,
              skillNormal: 10,
              skillEnhanced: 10,
              skillSub: 10,
              equip1: 10,
              equip2: 10,
              equip3: 10,
              equipSpecial: 2,
              weaponLevel: 50,
              abilityHp: 25,
              abilityAtk: 25,
              abilityHeal: 25,
            },
          },
          {
            slot: 1,
            studentUid: swimsuitMika,
            snapshot: {
              tier: 7,
              level: 90,
              skillEx: 5,
              skillNormal: 10,
              skillEnhanced: 10,
              skillSub: 10,
              equip1: 10,
              equip2: 10,
              equip3: 10,
              weaponLevel: 40,
            },
          },
          {
            slot: 2,
            studentUid: aru,
            snapshot: {
              tier: 6,
              level: 90,
              skillEx: 5,
              skillNormal: 10,
              skillEnhanced: 10,
              skillSub: 10,
              equip1: 10,
              equip2: 10,
              equip3: 10,
              weaponLevel: 30,
            },
          },
          {
            slot: 3,
            studentUid: uniformNeru,
            snapshot: {
              tier: 5,
              level: 88,
              skillEx: 5,
              skillNormal: 10,
              skillEnhanced: 8,
              skillSub: 10,
              equip1: 9,
              equip2: 10,
              equip3: 9,
            },
          },
          {
            slot: 4,
            studentUid: swimsuitShiroko,
            snapshot: {
              tier: 4,
              level: 87,
              skillEx: 5,
              skillNormal: 8,
              skillEnhanced: 8,
              skillSub: 10,
              equip1: 9,
              equip2: 9,
              equip3: 9,
            },
          },
          {
            slot: 5,
            studentUid: swimsuitNagisa,
            snapshot: {
              tier: 3,
              level: 85,
              skillEx: 4,
              skillNormal: 7,
              skillEnhanced: 7,
              skillSub: 7,
              equip1: 8,
              equip2: 8,
              equip3: 8,
            },
          },
        ],
        steps: [
          {
            uid: "demo-step-1",
            order: 0,
            kind: "actions",
            marker: { kind: "immediate", value: "즉시" },
            actions: [{ kind: "student_ex", studentUid: armedAris, text: "자신에게 사용" }],
          },
          {
            uid: "demo-step-2",
            order: 1,
            kind: "actions",
            marker: { kind: "cost", value: "코스트 5" },
            actions: [
              {
                kind: "student_ex",
                studentUid: swimsuitNagisa,
                targetStudentUid: armedAris,
              },
            ],
          },
          {
            uid: "demo-step-3",
            order: 2,
            kind: "actions",
            marker: { kind: "cost", value: "코스트 6" },
            actions: [{ kind: "student_ex", studentUid: swimsuitShiroko }],
          },
          {
            uid: "demo-step-4",
            order: 3,
            kind: "actions",
            marker: { kind: "immediate", value: "즉시" },
            actions: [
              { kind: "student_ex", studentUid: armedAris, copied: true, text: "자신에게 사용" },
              { kind: "student_ex", studentUid: armedAris },
            ],
          },
          {
            uid: "demo-step-5",
            order: 4,
            kind: "actions",
            marker: { kind: "time_remaining", value: "02:30.566" },
            actions: [{ kind: "student_ex", studentUid: uniformNeru, text: "대결상태" }],
          },
          {
            uid: "demo-step-6",
            order: 5,
            kind: "actions",
            marker: { kind: "immediate", value: "즉시" },
            actions: [{ kind: "student_ex", studentUid: uniformNeru }],
            note: "그로기 안걸리면 리트",
          },
          {
            uid: "demo-divider-1",
            order: 6,
            kind: "divider",
            actions: [],
            note: "그로기 상태",
          },
          {
            uid: "demo-step-7",
            order: 7,
            kind: "actions",
            marker: { kind: "after", value: "아루 1스 후" },
            actions: [{ kind: "student_ex", studentUid: aru }],
          },
          {
            uid: "demo-step-8",
            order: 8,
            kind: "actions",
            marker: { kind: "cost", value: "코스트 8" },
            actions: [
              {
                kind: "student_ex",
                studentUid: swimsuitNagisa,
                targetStudentUid: swimsuitMika,
              },
              { kind: "student_ex", studentUid: swimsuitMika, text: "자신에게" },
            ],
          },
          {
            uid: "demo-step-9",
            order: 9,
            kind: "actions",
            marker: { kind: "cost", value: "코스트 2" },
            actions: [
              { kind: "student_ex", studentUid: swimsuitMika },
              { kind: "student_ex", studentUid: swimsuitMika },
            ],
          },
        ],
      },
    ],
  },
  createdAt: new Date("2026-07-18T00:00:00.000Z"),
  updatedAt: new Date("2026-07-18T00:00:00.000Z"),
} satisfies Omit<WalkthroughTimelineRecord, "userId">;

export function isDemoWalkthroughTimelineUid(uid: string | undefined): boolean {
  return uid === DEMO_WALKTHROUGH_TIMELINE_UID;
}
