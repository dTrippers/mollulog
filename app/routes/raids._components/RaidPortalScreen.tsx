import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { ChartBarIcon, PlayIcon, QueueListIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Link } from "react-router";
import { getMaxLevelAt, type RaidPartyStudentMap } from "~/components/features/raids";
import { AttributeBadge, Button, EmptyView, HorizontalScroll, SubTitle } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { raidTypeToParam } from "~/domain/raid";
import { compareInstantAsc, formatInstant } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl, studentImageUrl } from "~/models/assets";
import type { RaidType } from "~/models/content.d";
import type { RaidScheduleListItem } from "~/models/raid";
import type { RaidVideoItem } from "~/models/raid-videos";
import type { RaidPortalData, RaidPortalUpcomingRaid } from "~/views/raid-portal";
import RaidPortalVideoCard from "./RaidPortalVideoCard";

type RaidPortalScreenProps = RaidPortalData;

function getRaidPath(raid: Pick<RaidScheduleListItem, "raidType" | "seasonIndex">) {
  return `/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`;
}

function getRaidKey(raid: Pick<RaidScheduleListItem, "raidType" | "seasonIndex">) {
  return `${raid.raidType}:${raid.seasonIndex}`;
}

export function getNearestUpcomingRaid(upcomingRaids: RaidPortalUpcomingRaid[]) {
  return upcomingRaids.reduce<RaidPortalUpcomingRaid | null>((nearest, candidate) => {
    if (!nearest) {
      return candidate;
    }
    if (!candidate.raid.startAt) {
      return nearest;
    }
    if (!nearest.raid.startAt || compareInstantAsc(candidate.raid.startAt, nearest.raid.startAt) < 0) {
      return candidate;
    }
    return nearest;
  }, null);
}

function getDefenseTypes(raid: RaidScheduleListItem) {
  return [...new Set(raid.defenseTypeSets.flatMap(({ defenseTypes }) => defenseTypes))];
}

function getRaidTimelinePath(raid: RaidScheduleListItem) {
  const searchParams = new URLSearchParams({
    bossUid: raid.raidBoss.uid,
    terrain: raid.terrain,
  });
  const defenseTypes = getDefenseTypes(raid);
  if (defenseTypes.length === 1) searchParams.set("defenseType", defenseTypes[0]);
  return `/timelines?${searchParams.toString()}`;
}

function formatRaidDateRange(raid: RaidScheduleListItem, timeZone: string) {
  const startDate = raid.startAt ? formatInstant(raid.startAt, { timeZone, format: "YYYY.MM.DD" }) : "미정";
  if (!raid.endAt) {
    return `${startDate} ~ 미정`;
  }

  const startYear = raid.startAt ? formatInstant(raid.startAt, { timeZone, format: "YYYY" }) : null;
  const endYear = formatInstant(raid.endAt, { timeZone, format: "YYYY" });
  const endFormat = startYear === endYear ? "MM.DD" : "YYYY.MM.DD";
  return `${startDate} ~ ${formatInstant(raid.endAt, { timeZone, format: endFormat })}`;
}

export default function RaidPortalScreen({
  currentRaids,
  upcomingRaids,
  recurringStudents,
  recurringStudentsStatus,
}: RaidPortalScreenProps) {
  const featuredUpcomingRaid = currentRaids.length === 0 ? getNearestUpcomingRaid(upcomingRaids) : null;
  const lowerUpcomingRaids = featuredUpcomingRaid
    ? upcomingRaids.filter(({ raid }) => raid.uid !== featuredUpcomingRaid.raid.uid)
    : upcomingRaids;

  return (
    <div className="space-y-6 py-4 md:space-y-10 md:py-6">
      {currentRaids.length > 0 ? (
        currentRaids.map(({ raid, videos, videoStatus, partyStudents }) => (
          <CurrentRaidSection
            key={raid.uid}
            raid={raid}
            videos={videos}
            videoStatus={videoStatus}
            partyStudents={partyStudents}
          />
        ))
      ) : featuredUpcomingRaid ? (
        <FeaturedUpcomingRaid raid={featuredUpcomingRaid.raid} />
      ) : (
        <EmptyView text="현재 진행 중이거나 예정된 총력전/대결전이 없어요" />
      )}

      <UpcomingRaids upcomingRaids={lowerUpcomingRaids} />

      {upcomingRaids.length > 0 ? (
        <RecurringStudents
          students={recurringStudents}
          status={recurringStudentsStatus}
          upcomingRaids={upcomingRaids}
        />
      ) : null}
    </div>
  );
}

function FeaturedUpcomingRaid({ raid }: { raid: RaidScheduleListItem }) {
  return (
    <section>
      <SubTitle text="다음 시즌" />
      <RaidHeroCard raid={raid} status="upcoming" />
    </section>
  );
}

function RaidHeroCard({ raid, status }: { raid: RaidScheduleListItem; status: "current" | "upcoming" }) {
  const displayTimeZone = useDisplayTimeZone();
  const raidPath = getRaidPath(raid);
  const timelinePath = getRaidTimelinePath(raid);
  const isCurrent = status === "current";

  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
      <div className="relative overflow-hidden p-5 md:p-6">
        <img
          src={bossImageUrl(raid.raidBoss.uid)}
          alt=""
          className="absolute top-0 right-0 h-full w-2/3 object-cover opacity-35 sm:w-1/2"
        />
        <div className="absolute inset-0 bg-linear-to-r from-card via-card/95 to-card/45" />
        <span className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm md:top-5 md:right-5">
          <span
            className={isCurrent ? "size-2 rounded-full bg-red-500 animate-pulse" : "size-2 rounded-full bg-sky-400"}
            aria-hidden="true"
          />
          {isCurrent ? "진행 중" : "예정"}
        </span>

        <div className="relative max-w-3xl">
          <h2 className="pr-24 text-2xl font-bold text-foreground">{raid.raidBoss.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex} ·{" "}
            {terrainLocale[raid.terrain]}
            {isCurrent && raid.startAt && raid.endAt
              ? ` · ${formatInstant(raid.startAt, { timeZone: displayTimeZone, format: "M.D" })}–${formatInstant(raid.endAt, { timeZone: displayTimeZone, format: "M.D" })}`
              : ""}
          </p>
          {!isCurrent ? (
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {formatRaidDateRange(raid, displayTimeZone)}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2">
            {raid.defenseTypeSets.map(({ difficulty, defenseTypes }) => (
              <div key={`${difficulty ?? "none"}-${defenseTypes.join("-")}`} className="flex items-center gap-1.5">
                {difficulty ? (
                  <span className="text-xs text-muted-foreground">{difficultyLocale[difficulty]}</span>
                ) : null}
                {defenseTypes.map((defenseType) => (
                  <AttributeBadge
                    key={defenseType}
                    text={defenseTypeLocale[defenseType]}
                    color={defenseTypeColor[defenseType]}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button text="통계" to={raidPath} icon={ChartBarIcon} size="sm" />
            <Button text="편성" to={`${raidPath}/ranks`} icon={UserGroupIcon} size="sm" />
            <Button text="영상" to={`${raidPath}/videos`} icon={PlayIcon} size="sm" />
            <Button text="공략" to={timelinePath} icon={QueueListIcon} size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentRaidSection({
  raid,
  videos,
  videoStatus,
  partyStudents,
}: {
  raid: RaidScheduleListItem;
  videos: RaidVideoItem[];
  videoStatus: RaidPortalData["currentRaids"][number]["videoStatus"];
  partyStudents: RaidPartyStudentMap;
}) {
  const raidPath = getRaidPath(raid);

  return (
    <section>
      <RaidHeroCard raid={raid} status="current" />

      <div className="mt-6 flex items-end justify-between gap-4 md:mt-8">
        <SubTitle text="공략 영상" description="YouTube에 올라온 공략 영상과 편성 정보" />
        {videos.length > 0 ? (
          <Link
            to={`${raidPath}/videos`}
            className="mb-3 hidden shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:block"
          >
            전체 →
          </Link>
        ) : null}
      </div>
      <RaidVideoList raid={raid} videos={videos} status={videoStatus} partyStudents={partyStudents} />
    </section>
  );
}

function RaidVideoList({
  raid,
  videos,
  status,
  partyStudents,
}: {
  raid: RaidScheduleListItem;
  videos: RaidVideoItem[];
  status: RaidPortalData["currentRaids"][number]["videoStatus"];
  partyStudents: RaidPartyStudentMap;
}) {
  if (videos.length === 0) {
    return <EmptyView text={getVideoEmptyText(status)} />;
  }

  const maxLevel = getMaxLevelAt(raid.jpSchedule?.startAt ?? raid.startAt ?? new Date());
  const raidPath = getRaidPath(raid);

  return (
    <>
      <div className="hidden grid-cols-4 gap-4 lg:grid">
        {videos.map((video) => (
          <RaidPortalVideoCard key={video.youtubeId} video={video} allStudents={partyStudents} maxLevel={maxLevel} />
        ))}
      </div>

      <div className="lg:hidden">
        <HorizontalScroll
          itemWidth={{ mobile: "w-[86%]", desktop: "md:w-[44%]" }}
          gap="gap-3"
          className="-mx-4 px-4 pb-1"
        >
          {videos.map((video) => (
            <RaidPortalVideoCard key={video.youtubeId} video={video} allStudents={partyStudents} maxLevel={maxLevel} />
          ))}
        </HorizontalScroll>
        <Button text="공략 영상 더보기" to={`${raidPath}/videos?sort=published_at_desc`} fullWidth className="mt-4" />
      </div>
    </>
  );
}

function getVideoEmptyText(status: RaidPortalData["currentRaids"][number]["videoStatus"]) {
  if (status === "error") {
    return "공략 영상을 불러오지 못했어요";
  }
  if (status === "unavailable") {
    return "연결된 일본 서버 일정이 없어요";
  }
  return "편성 정보가 있는 영상이 없어요";
}

function UpcomingRaids({ upcomingRaids }: { upcomingRaids: RaidPortalUpcomingRaid[] }) {
  const displayTimeZone = useDisplayTimeZone();

  if (upcomingRaids.length === 0) {
    return null;
  }

  return (
    <section>
      <SubTitle text="다가오는 시즌" />
      <div className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 lg:hidden">
        {upcomingRaids.map(({ raid }) => {
          const raidPath = getRaidPath(raid);
          const timelinePath = getRaidTimelinePath(raid);
          return (
            <article key={raid.uid} className="px-3 py-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <p className="shrink-0 text-xs font-medium text-muted-foreground">
                  {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex}
                </p>
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{raid.raidBoss.name}</h3>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {raid.startAt ? formatInstant(raid.startAt, { timeZone: displayTimeZone, format: "M.D" }) : "미정"}
                </p>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-1 text-xs">
                    {terrainLocale[raid.terrain]}
                  </span>
                  {getDefenseTypes(raid).map((defenseType) => (
                    <AttributeBadge
                      key={defenseType}
                      text={defenseTypeLocale[defenseType]}
                      color={defenseTypeColor[defenseType]}
                    />
                  ))}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button text="통계" to={raidPath} size="xs" />
                  <Button text="편성" to={`${raidPath}/ranks`} size="xs" />
                  <Button text="영상" to={`${raidPath}/videos`} size="xs" />
                  <Button text="공략" to={timelinePath} size="xs" />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 lg:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">예상 일정</th>
              <th className="px-3 py-2 font-medium">시즌</th>
              <th className="px-3 py-2 font-medium">보스</th>
              <th className="px-3 py-2 font-medium">지형</th>
              <th className="px-3 py-2 font-medium">방어 타입</th>
              <th className="px-3 py-2 font-medium">자세히 보기</th>
            </tr>
          </thead>
          <tbody>
            {upcomingRaids.map(({ raid }) => {
              const raidPath = getRaidPath(raid);
              const timelinePath = getRaidTimelinePath(raid);
              return (
                <tr key={raid.uid} className="border-b border-border/70 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                    {raid.startAt ? formatInstant(raid.startAt, { timeZone: displayTimeZone, format: "M.D" }) : "미정"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex}
                  </td>
                  <td className="px-3 py-3 font-semibold">{raid.raidBoss.name}</td>
                  <td className="whitespace-nowrap px-3 py-3">{terrainLocale[raid.terrain]}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {getDefenseTypes(raid).map((defenseType) => (
                        <AttributeBadge
                          key={defenseType}
                          text={defenseTypeLocale[defenseType]}
                          color={defenseTypeColor[defenseType]}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <Button text="통계" to={raidPath} size="xs" />
                      <Button text="편성" to={`${raidPath}/ranks`} size="xs" />
                      <Button text="영상" to={`${raidPath}/videos`} size="xs" />
                      <Button text="공략" to={timelinePath} size="xs" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecurringStudents({
  students,
  status,
  upcomingRaids,
}: {
  students: RaidPortalData["recurringStudents"];
  status: RaidPortalData["recurringStudentsStatus"];
  upcomingRaids: RaidPortalUpcomingRaid[];
}) {
  const [expandedStudentUid, setExpandedStudentUid] = useState<string | null>(null);

  return (
    <section>
      <SubTitle text="앞으로의 학생 출전률" />
      {students.length > 0 ? (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 lg:hidden">
            {students.map((student, index) => {
              const usageByRaidKey = new Map(student.raidUsages.map((usage) => [usage.raidKey, usage]));
              const expanded = expandedStudentUid === student.studentUid;
              const detailsId = `student-raid-usage-${student.studentUid}`;
              return (
                <article key={student.studentUid}>
                  <div className="flex min-h-16 items-center gap-2 px-3 py-2">
                    <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <Link
                      to={`/students/${student.studentUid}`}
                      className="flex min-w-0 flex-1 items-center gap-2 hover:text-primary"
                    >
                      <img
                        src={studentImageUrl(student.studentUid)}
                        alt=""
                        className="size-9 shrink-0 rounded-full bg-muted object-cover"
                        loading="lazy"
                      />
                      <h3 className="min-w-0 truncate text-sm font-semibold">{student.name}</h3>
                    </Link>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      <span className="text-xs font-normal text-muted-foreground">누적 </span>
                      {student.totalCount.toLocaleString()}회
                    </p>
                    <button
                      type="button"
                      className="-mr-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      aria-label={`${student.name} 시즌별 출전률 ${expanded ? "접기" : "펼치기"}`}
                      onClick={() =>
                        setExpandedStudentUid((current) => (current === student.studentUid ? null : student.studentUid))
                      }
                    >
                      <ChevronDownIcon className={cn("size-5 transition-transform", expanded && "rotate-180")} />
                    </button>
                  </div>
                  {expanded ? (
                    <div id={detailsId} className="space-y-2 border-t border-border/70 bg-muted/30 px-3 py-3">
                      {upcomingRaids.map(({ raid }) => {
                        const usage = usageByRaidKey.get(getRaidKey(raid));
                        return (
                          <div key={raid.uid} className="flex items-center gap-2">
                            <div className="w-28 shrink-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex} ·{" "}
                                {raid.raidBoss.name}
                              </p>
                            </div>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              {usage ? (
                                <div
                                  className="h-full rounded-full bg-sky-500/60"
                                  style={{ width: `${Math.min(usage.usageRate, 1) * 100}%` }}
                                />
                              ) : null}
                            </div>
                            <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">
                              {usage ? `${Math.round(usage.usageRate * 100)}%` : "-"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 min-w-44 bg-card px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    학생
                  </th>
                  {upcomingRaids.map(({ raid }) => (
                    <th key={raid.uid} className="min-w-32 px-3 py-3 text-left font-normal">
                      <p className="truncate text-xs text-muted-foreground">
                        {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex}
                      </p>
                      <p className="truncate text-sm font-semibold text-foreground">{raid.raidBoss.name}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const usageByRaidKey = new Map(student.raidUsages.map((usage) => [usage.raidKey, usage]));
                  return (
                    <tr key={student.studentUid} className="border-b border-border/70 last:border-0">
                      <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-normal">
                        <Link
                          to={`/students/${student.studentUid}`}
                          className="flex items-center gap-3 hover:text-primary"
                        >
                          <img
                            src={studentImageUrl(student.studentUid)}
                            alt=""
                            className="size-10 rounded-full bg-muted object-cover"
                            loading="lazy"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{student.name}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              누적 {student.totalCount.toLocaleString()}회
                            </p>
                          </div>
                        </Link>
                      </th>
                      {upcomingRaids.map(({ raid }) => {
                        const usage = usageByRaidKey.get(getRaidKey(raid));
                        return (
                          <td key={raid.uid} className="px-3 py-3">
                            {usage ? (
                              <div
                                className="relative h-8 overflow-hidden rounded-md bg-muted"
                                title={`${usage.count.toLocaleString()}회`}
                              >
                                <div
                                  className="absolute inset-y-0 left-0 rounded-md bg-sky-500/35"
                                  style={{ width: `${Math.min(usage.usageRate, 1) * 100}%` }}
                                />
                                <span className="relative flex h-full items-center justify-end px-2 text-xs font-semibold tabular-nums">
                                  {Math.round(usage.usageRate * 100)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyView
          text={
            status === "error"
              ? "향후 시즌 채용 정보를 불러오지 못했어요"
              : status === "unavailable"
                ? "비교할 수 있는 시즌 정보가 없어요"
                : "두 시즌 이상 겹치는 학생이 없어요"
          }
        />
      )}
    </section>
  );
}
