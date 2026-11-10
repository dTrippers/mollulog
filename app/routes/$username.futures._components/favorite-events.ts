import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { parseUtcTimestamp, type UtcIsoString } from "~/lib/date-time";
import { recruitmentLabelLocale, schoolNameLocale } from "~/locales/ko";
import type { ContentCommentWithSensei } from "~/models/content";
import type { Role } from "~/models/content.d";
import type { StudentSkillItems } from "~/models/student";

const RAID_CONTENT_TYPES = new Set(["total_assault", "elimination", "unlimit", "allied"]);
const RECENT_OPINION_DAYS = 3;

export type FavoriteEventStudent = {
  // The favorite key: the student uid, or a provisional key for a student whose data is still being prepared.
  key: string;
  uid: string | null;
  name: string;
  recruitmentLabel: string;
  school: string | null;
  attackType: Attack | null;
  defenseType: Defense | null;
  role: Role | null;
  equipments: string[];
  // The ex skill's artifact items at level 5. A rarity-4 item is the main one.
  artifactItems: { uid: string; rarity: number }[];
};

// `null` means the opinions could not be loaded, which is not the same as no opinions.
export type FavoriteEventOpinion = {
  count: number;
  hasRecentOpinion: boolean;
  // The profile owner's pinned opinion on the event.
  pinnedBody: string | null;
} | null;

export type FavoriteEvent = {
  uid: string;
  name: string;
  since: UtcIsoString;
  until: UtcIsoString;
  // Days until the event starts, counted in UTC days. Zero or less once it has started.
  daysUntilStart: number;
  students: FavoriteEventStudent[];
  opinion: FavoriteEventOpinion;
};

type SourceContent = {
  uid: string;
  name: string;
  contentType: string;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  recruitments: {
    recruitmentType: RecruitmentTypeEnum;
    rerun: boolean;
    studentName: string;
    favoriteKey: string;
    student: { uid: string } | null;
  }[];
};

type SourceStudent = {
  uid: string;
  name: string;
  school: string;
  attackType: Attack;
  defenseType: Defense;
  role: string;
  equipments: string[];
};

// The upcoming and ongoing events (raids excluded) where the profile owner registered favorite students, each with the
// favorited students in the event's recruitment order.
export function selectFavoriteEventContents<Content extends SourceContent>(
  contents: Content[],
  favorites: { studentId: string; contentId: string }[],
): { content: Content; favoriteKeys: Set<string> }[] {
  const keysByContent = new Map<string, Set<string>>();
  for (const { studentId, contentId } of favorites) {
    const keys = keysByContent.get(contentId) ?? new Set<string>();
    keys.add(studentId);
    keysByContent.set(contentId, keys);
  }
  return contents.flatMap((content) => {
    const favoriteKeys = keysByContent.get(content.uid);
    if (RAID_CONTENT_TYPES.has(content.contentType) || !favoriteKeys) return [];
    if (!content.recruitments.some((recruitment) => favoriteKeys.has(recruitment.favoriteKey))) return [];
    return [{ content, favoriteKeys }];
  });
}

export function buildFavoriteEvent({
  content,
  favoriteKeys,
  studentsByUid,
  skillItemsByUid,
  opinions,
  ownerUsername,
  now,
}: {
  content: SourceContent;
  favoriteKeys: Set<string>;
  studentsByUid: Record<string, SourceStudent | undefined>;
  skillItemsByUid: Map<string, StudentSkillItems>;
  opinions: ContentCommentWithSensei[] | null;
  ownerUsername: string;
  now: UtcIsoString;
}): FavoriteEvent {
  const seen = new Set<string>();
  const students = content.recruitments.flatMap((recruitment): FavoriteEventStudent[] => {
    if (!favoriteKeys.has(recruitment.favoriteKey) || seen.has(recruitment.favoriteKey)) return [];
    seen.add(recruitment.favoriteKey);
    const student = recruitment.student ? studentsByUid[recruitment.student.uid] : undefined;
    const skillItems = student ? (skillItemsByUid.get(student.uid)?.skillItems ?? []) : [];
    return [
      {
        key: recruitment.favoriteKey,
        uid: student?.uid ?? null,
        name: student?.name ?? recruitment.studentName,
        recruitmentLabel: recruitmentLabelLocale(recruitment),
        school: student ? (schoolNameLocale[student.school] ?? null) : null,
        attackType: student?.attackType ?? null,
        defenseType: student?.defenseType ?? null,
        role: (student?.role as Role | undefined) ?? null,
        equipments: student?.equipments ?? [],
        artifactItems: skillItems
          .filter(({ item }) => item.subCategory === "artifact")
          .map(({ item }) => ({ uid: item.uid, rarity: item.rarity }))
          .sort((a, b) => b.rarity - a.rarity),
      },
    ];
  });

  return {
    uid: content.uid,
    name: content.name,
    since: content.startAt,
    until: content.endAt ?? content.startAt,
    daysUntilStart: parseUtcTimestamp(content.startAt)
      .startOf("day")
      .diff(parseUtcTimestamp(now).startOf("day"), "day"),
    students,
    opinion: opinions === null ? null : summarizeOpinions(opinions, ownerUsername, now),
  };
}

function summarizeOpinions(
  opinions: ContentCommentWithSensei[],
  ownerUsername: string,
  now: UtcIsoString,
): NonNullable<FavoriteEventOpinion> {
  const recentSince = parseUtcTimestamp(now).subtract(RECENT_OPINION_DAYS, "day");
  const pinned = opinions.find(
    (opinion) => !opinion.parentCommentId && opinion.pinned && opinion.sensei.username === ownerUsername,
  );
  return {
    count: opinions.length,
    hasRecentOpinion: opinions.some((opinion) => !parseUtcTimestamp(opinion.createdAt).isBefore(recentSince)),
    pinnedBody: pinned?.body ?? null,
  };
}
