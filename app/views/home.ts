import type { HomeCampaign, HomeJointFiringDrill } from "~/domain/home-content";
import {
  getHomeBirthdayMonthDays,
  getHomeRecruitmentKindLabel,
  type HomeBirthday,
  type HomeBirthdayCandidate,
  selectHomeBirthdays,
  selectHomeEventSlot,
  selectHomeScheduleSlot,
  toBirthdayMonthDay,
} from "~/domain/home-portal";
import { getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { cacheKey, fetchRouteCached } from "~/lib/cache";
import { formatInstantDateKey, isInstantAfter, nowUtcIso, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import type { Role } from "~/models/content.d";
import { getEventMinigameType } from "~/models/event-content";
import { getFavoritedCounts } from "~/models/favorite-students";
import { getHomeCampaigns, getHomeJointFiringDrills } from "~/models/home-overview";
import { getNewsPosts, type Post } from "~/models/post";
import { getRecruitmentGroupsOrThrow } from "~/models/recruitment";
import { getAllStudents, getStudentCharacterUids } from "~/models/student";
import type { TimelineContent } from "~/models/timeline-content";
import {
  findEventsForRecruitmentStudent,
  getHomeMainStoryContent,
  getTimelineContentsByContentTypes,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content.server";
import { getUpcomingRaidContents, type TimelineRaidContent } from "./raid-content";

export type HomeSourceResult<T> = { status: "success"; data: T } | { status: "error" };

// One source fails alone: its failure is logged and reported as an error result, and the other sources keep their data.
async function loadHomeSource<T>(
  load: () => Promise<T>,
  onError: (error: unknown) => void,
): Promise<HomeSourceResult<T>> {
  try {
    return { status: "success", data: await load() };
  } catch (error) {
    onError(error);
    return { status: "error" };
  }
}

export type HomeOverviewSources = {
  campaigns: HomeSourceResult<HomeCampaign[]>;
  jointFiringDrills: HomeSourceResult<HomeJointFiringDrill[]>;
  mainStoryContent: HomeSourceResult<TimelineContent | null>;
};

export async function getHomeOverviewSources(env: Env, forceRefresh = false, ctx?: ExecutionContext) {
  const logger = getLogger(env, ctx, { route: "home.overview" });
  const now = nowUtcIso();
  const [campaigns, jointFiringDrills, mainStoryContent] = await Promise.all([
    loadHomeSource(
      () => getHomeCampaigns(env, forceRefresh),
      (error) => logger.error("Failed to load home campaigns", error),
    ),
    loadHomeSource(
      () => getHomeJointFiringDrills(env, forceRefresh),
      (error) => logger.error("Failed to load home joint firing drills", error),
    ),
    loadHomeSource(
      () => getHomeMainStoryContent(env, now, { ctx }),
      (error) => logger.error("Failed to load home main story contents", error),
    ),
  ]);

  return { campaigns, jointFiringDrills, mainStoryContent } satisfies HomeOverviewSources;
}

export type HomeEventsSource = {
  main: TimelineContent | null;
  together: TimelineContent[];
  upcoming: TimelineContent | null;
  // The minigame type of the hero event (ongoing, or the next one). Null when it has no minigame.
  minigameType: string | null;
};

export type IndexRecruitment = {
  student: { uid: string; name: string; attackType: Attack; defenseType: Defense; role: Role } | null;
  favoriteKey: string;
  // The content the favorite count belongs to: the student's event, or the group when no event is linked.
  contentUid: string;
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  studentName: string;
};

export type HomeRecruitmentGroup = {
  groupUid: string;
  eventUid: string | null;
  eventName: string | null;
  eventImageUrl: string | null;
  kindLabel: string;
  since: UtcIsoString;
  until: UtcIsoString;
  recruitments: IndexRecruitment[];
};

export type HomeFavoritedCount = Awaited<ReturnType<typeof getFavoritedCounts>>[number];

export type HomeRaidSlot = { ongoing: TimelineRaidContent[]; upcoming: TimelineRaidContent | null };

export type HomeRaidSlots = {
  total: HomeRaidSlot;
  unlimit: HomeRaidSlot;
};

export type HomeIndexContents = {
  events: HomeSourceResult<HomeEventsSource>;
  recruitmentGroups: HomeSourceResult<HomeRecruitmentGroup[]>;
  raids: HomeSourceResult<HomeRaidSlots>;
  overview: HomeOverviewSources;
  news: HomeSourceResult<Post[]>;
};

const TOTAL_RAID_TYPES = new Set(["total_assault", "elimination"]);

// The content a student's favorite and count belong to: the event that lists the student, else the group's first event,
// else the group itself.
function recruitmentContentUid(groupEvents: TimelineContent[], studentUid: string | null, groupUid: string): string {
  return findEventsForRecruitmentStudent(groupEvents, studentUid)[0]?.uid ?? groupEvents[0]?.uid ?? groupUid;
}

// Recruitment groups on screen: archives are never shown.
function buildRecruitmentGroups(
  groups: Awaited<ReturnType<typeof getRecruitmentGroupsOrThrow>>,
  timelineContents: TimelineContent[],
  now: UtcIsoString,
): HomeRecruitmentGroup[] {
  const eventsByGroupUid = groupTimelineContentsByRecruitmentGroupUid(timelineContents);
  return groups.flatMap((group) => {
    const recruitments = group.recruitments.filter(
      (recruitment) =>
        recruitment.recruitmentType !== "archive" &&
        recruitment.until !== null &&
        isInstantAfter(toUtcIso(recruitment.until), now),
    );
    if (recruitments.length === 0) {
      return [];
    }
    const groupEvents = eventsByGroupUid.get(group.uid) ?? [];
    const firstStudentUid = recruitments.find((recruitment) => recruitment.student)?.student?.uid ?? null;
    const event = findEventsForRecruitmentStudent(groupEvents, firstStudentUid)[0] ?? groupEvents[0] ?? null;
    const sinces = recruitments.map((recruitment) => toUtcIso(recruitment.since)).sort();
    const untils = recruitments.map((recruitment) => toUtcIso(recruitment.until ?? now)).sort();
    return [
      {
        groupUid: group.uid,
        eventUid: event?.uid ?? null,
        eventName: event?.name ?? null,
        eventImageUrl: event?.imageUrl ?? null,
        kindLabel: getHomeRecruitmentKindLabel(recruitments),
        since: sinces[0],
        until: untils[untils.length - 1],
        recruitments: recruitments.map(
          (recruitment): IndexRecruitment => ({
            student: recruitment.student
              ? {
                  uid: recruitment.student.uid,
                  name: recruitment.student.name ?? "",
                  attackType: recruitment.student.attackType,
                  defenseType: recruitment.student.defenseType,
                  role: recruitment.student.role,
                }
              : null,
            favoriteKey: getRecruitmentFavoriteKey(recruitment),
            contentUid: recruitmentContentUid(groupEvents, recruitment.student?.uid ?? null, group.uid),
            recruitmentType: recruitment.recruitmentType,
            pickup: recruitment.pickup,
            rerun: recruitment.rerun,
            since: toUtcIso(recruitment.since),
            until: recruitment.until ? toUtcIso(recruitment.until) : null,
            studentName: recruitment.studentName,
          }),
        ),
      },
    ];
  });
}

// Every ongoing group, or the next one when none is ongoing.
function selectShownRecruitmentGroups(groups: HomeRecruitmentGroup[], now: UtcIsoString): HomeRecruitmentGroup[] {
  const slot = selectHomeScheduleSlot(
    groups.map((group) => ({ startAt: group.since, endAt: group.until, group })),
    now,
  );
  if (slot.ongoing.length > 0) {
    return slot.ongoing.map((item) => item.group);
  }
  return slot.upcoming ? [slot.upcoming.group] : [];
}

async function loadHomeRaidSlots(
  env: Env,
  forceRefresh: boolean,
  now: UtcIsoString,
  ctx?: ExecutionContext,
): Promise<HomeRaidSlots> {
  const contents = await getUpcomingRaidContents(env, {
    forceRefresh,
    raidTypes: ["total_assault", "elimination", "unlimit"],
    ctx,
  });
  const scheduled = contents.filter((content) => content.raidSchedule !== undefined);
  const total = selectHomeScheduleSlot(
    scheduled.filter((content) => TOTAL_RAID_TYPES.has(content.raidSchedule?.raidType ?? "")),
    now,
  );
  const unlimit = selectHomeScheduleSlot(
    scheduled.filter((content) => content.raidSchedule?.raidType === "unlimit"),
    now,
  );
  return { total, unlimit };
}

// Public sources of the home. Each one succeeds or fails alone. Personal state, the feed, and YouTube load per request in the
// route, and birthdays load per request with the display timezone, so none of them is part of this payload.
async function loadHomeIndexContents(
  env: Env,
  forceRefresh: boolean,
  ctx?: ExecutionContext,
): Promise<HomeIndexContents> {
  const logger = getLogger(env, ctx, { route: "home.index" });
  const now = nowUtcIso();

  const [timeline, groups, raids, news, overview] = await Promise.all([
    loadHomeSource(
      () =>
        getTimelineContentsByContentTypes(env, ["event", "mini_event"], now, { ctx }).then((contents) =>
          contents.filter((content) => !content.endAt || isInstantAfter(content.endAt, now)),
        ),
      (error) => logger.error("Failed to load home event timeline", error),
    ),
    loadHomeSource(
      () => getRecruitmentGroupsOrThrow(env, forceRefresh),
      (error) => logger.error("Failed to load home recruitment groups", error),
    ),
    loadHomeSource(
      () => loadHomeRaidSlots(env, forceRefresh, now, ctx),
      (error) => logger.error("Failed to load home raids", error),
    ),
    loadHomeSource(
      () => getNewsPosts(env, 1, 3, { ctx }).then((page) => page.items),
      (error) => logger.error("Failed to load home news", error),
    ),
    getHomeOverviewSources(env, forceRefresh, ctx),
  ]);

  const events: HomeSourceResult<HomeEventsSource> =
    timeline.status === "error"
      ? { status: "error" }
      : await loadHomeSource(
          async () => {
            const slot = selectHomeEventSlot(timeline.data, now);
            const hero = slot.main ?? slot.upcoming;
            const minigameType = hero ? await getEventMinigameType(env, hero, forceRefresh) : null;
            return { main: slot.main, together: slot.together, upcoming: slot.upcoming, minigameType };
          },
          (error) => logger.error("Failed to load home event minigame type", error),
        );

  const recruitmentGroups: HomeSourceResult<HomeRecruitmentGroup[]> =
    timeline.status === "error" || groups.status === "error"
      ? { status: "error" }
      : {
          status: "success",
          data: selectShownRecruitmentGroups(buildRecruitmentGroups(groups.data, timeline.data, now), now),
        };

  return {
    events,
    recruitmentGroups,
    raids,
    overview,
    news,
  };
}

// Favorite counts of the recruitment groups on screen. They are public but change between requests, so the route reads them per
// request beside the cached snapshot, never inside it. A failed read only hides the counts.
export async function getHomeFavoritedCounts(
  env: Env,
  recruitmentGroups: HomeSourceResult<HomeRecruitmentGroup[]>,
  ctx?: ExecutionContext,
): Promise<HomeSourceResult<HomeFavoritedCount[]>> {
  if (recruitmentGroups.status === "error") {
    return { status: "error" };
  }
  const logger = getLogger(env, ctx, { route: "home.favorited_counts" });
  return loadHomeSource(
    async () => {
      const recruitments = recruitmentGroups.data.flatMap((group) => group.recruitments);
      const counts = await getFavoritedCounts(
        env,
        recruitments.map((recruitment) => recruitment.favoriteKey),
        { ctx },
      );
      return counts.filter((count) =>
        recruitments.some(
          (recruitment) => recruitment.favoriteKey === count.studentId && recruitment.contentUid === count.contentId,
        ),
      );
    },
    (error) => logger.error("Failed to load home favorited counts", error),
  );
}

function isCompleteHomeIndexContents(contents: HomeIndexContents): boolean {
  return (
    contents.events.status === "success" &&
    contents.recruitmentGroups.status === "success" &&
    contents.raids.status === "success" &&
    contents.news.status === "success" &&
    contents.overview.campaigns.status === "success" &&
    contents.overview.jointFiringDrills.status === "success" &&
    contents.overview.mainStoryContent.status === "success"
  );
}

// The route cache stores only a complete snapshot. An incomplete payload travels in this error, so every caller of the same read
// gets its contents, and a retry reads the failed source again instead of serving its failure for the whole cache window.
export class HomeIndexIncompleteError extends Error {
  readonly contents: HomeIndexContents;

  constructor(contents: HomeIndexContents) {
    super("home index contents are incomplete");
    this.name = "HomeIndexIncompleteError";
    this.contents = contents;
  }
}

export async function getIndexContents(
  env: Env,
  forceRefresh = false,
  ctx?: ExecutionContext,
): Promise<HomeIndexContents> {
  try {
    return await fetchRouteCached<HomeIndexContents>(
      env,
      ctx,
      cacheKey("route", "index", 5, "all"),
      async () => {
        const contents = await loadHomeIndexContents(env, forceRefresh, ctx);
        if (!isCompleteHomeIndexContents(contents)) {
          throw new HomeIndexIncompleteError(contents);
        }
        return contents;
      },
      forceRefresh,
    );
  } catch (error) {
    if (error instanceof HomeIndexIncompleteError) {
      return error.contents;
    }
    throw error;
  }
}

// The nearest birthdays within 30 calendar days of today in the display timezone, at most 5. Students come from the released list only, and
// skins merge through the BAQL character UID. Both reads are per request, not cached with the public snapshot.
export async function getHomeBirthdaySource(
  env: Env,
  { now, timeZone, ctx }: { now: UtcIsoString; timeZone: string; ctx?: ExecutionContext },
): Promise<HomeSourceResult<HomeBirthday[]>> {
  const logger = getLogger(env, ctx, { route: "home.birthdays" });
  return loadHomeSource(
    async () => {
      const todayKey = formatInstantDateKey(now, timeZone);
      const monthDays = new Set(getHomeBirthdayMonthDays(todayKey));
      const students = await getAllStudents(env);
      // A student without a birthday is left out of the window. A malformed birthday fails the source.
      const dated = students.flatMap((student) => {
        const monthDay = toBirthdayMonthDay(student.birthday);
        return monthDay !== null && monthDays.has(monthDay) ? [{ student, monthDay }] : [];
      });
      const characterUids = await getStudentCharacterUids(
        env,
        dated.map(({ student }) => student.uid),
      );
      const candidates: HomeBirthdayCandidate[] = dated.map(({ student, monthDay }) => ({
        uid: student.uid,
        name: student.name,
        birthday: monthDay,
        characterUid: characterUids.get(student.uid) ?? null,
      }));
      return selectHomeBirthdays(candidates, todayKey);
    },
    (error) => logger.error("Failed to load home birthdays", error),
  );
}
