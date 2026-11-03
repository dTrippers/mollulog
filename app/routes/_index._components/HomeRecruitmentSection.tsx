import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { Link } from "react-router";
import BlurhashPlaceholder from "~/components/media/BlurhashPlaceholder";
import HaloModeNotice from "~/components/media/HaloModeNotice";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { StudentSlot } from "~/components/v2/features/students/StudentSlot";
import { StudentThumbList } from "~/components/v2/features/students/StudentThumbList";
import StudentPortrait from "~/components/v2/features/students/StudentPortrait";
import type { FutureStudentEntry } from "~/components/v2/features/students/types";
import { TrailingIconText } from "~/components/v2/primitives/TrailingIconText";
import { getHomeOngoingChip, getHomeUpcomingChip } from "~/domain/home-portal";
import { canCompleteRecruitmentStudent } from "~/domain/recruitment-result";
import { formatInstant, formatInstantDateKey, type UtcIsoString } from "~/lib/date-time";
import { recruitmentLabelLocale } from "~/locales/ko";
import { uploadedImageProps } from "~/models/assets";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";
import type { HomeRecruitmentGroup, HomeSourceResult, IndexRecruitment } from "~/views/home";
import { HomeEmpty, HomeRetryButton, HomeSection, HomeTile, HomeTimeChip } from "./HomePrimitives";
import type { HomeViewerState } from "./home-viewer-state";

function groupChip(group: HomeRecruitmentGroup, now: UtcIsoString, timeZone: string) {
  return new Date(group.since) > new Date(now)
    ? getHomeUpcomingChip(group.since, now, timeZone)
    : getHomeOngoingChip(group.until, now, timeZone);
}

function completionMetaOf(recruitment: IndexRecruitment): RecruitmentCompletionMeta {
  // The loader carries no initial tier, so completion records the default tier, as the 1.x timeline did.
  return {
    tier: 3,
    pickup: recruitment.pickup && recruitment.recruitmentType !== "given",
    recruitmentType: recruitment.recruitmentType,
  };
}

function toStudentEntry({
  group,
  recruitment,
  viewer,
  now,
}: {
  group: HomeRecruitmentGroup;
  recruitment: IndexRecruitment & { student: NonNullable<IndexRecruitment["student"]> };
  viewer: HomeViewerState;
  now: UtcIsoString;
}): FutureStudentEntry {
  const { student, contentUid, favoriteKey } = recruitment;
  const favorited = viewer.isFavorited(contentUid, favoriteKey);
  const completed = viewer.isCompleted(group.groupUid, student.uid);
  // Null while the counts load or when they failed. The count then stays hidden.
  const favoritedCount = viewer.favoriteCount(contentUid, favoriteKey);
  return {
    favoriteKey,
    studentUid: student.uid,
    studentName: recruitment.studentName,
    attackType: student.attackType,
    defenseType: student.defenseType,
    role: student.role,
    recruitmentLabel: recruitmentLabelLocale({
      recruitmentType: recruitment.recruitmentType,
      rerun: recruitment.rerun,
    }),
    recruitmentType: recruitment.recruitmentType,
    pickup: recruitment.pickup,
    rerun: recruitment.rerun,
    since: recruitment.since,
    until: recruitment.until,
    favoritedCount,
    favorited,
    completed,
    canComplete: canCompleteRecruitmentStudent({ recruitmentSince: recruitment.since, favorited, now }),
    viewerPending: viewer.status === "pending",
    viewerUnavailable: viewer.status === "failed",
    completionMeta: completionMetaOf(recruitment),
    resultEditLink: null,
    onToggleFavorite: (next) => viewer.toggleFavorite(contentUid, favoriteKey, next),
    onToggleComplete: (next) =>
      viewer.toggleComplete(group.groupUid, contentUid, student.uid, next, completionMetaOf(recruitment)),
  };
}

// A group without students shows its event banner in their place. The group header already names the event.
function GroupBanner({ group }: { group: HomeRecruitmentGroup }) {
  const { haloMode } = useHaloMode();
  if (!group.eventImageUrl) {
    return null;
  }
  return (
    <div className="relative aspect-[16/9] w-32 shrink-0 overflow-hidden rounded-md bg-v2-inset">
      {haloMode ? (
        <>
          <BlurhashPlaceholder blurhash={group.eventImageBlurhash} />
          <HaloModeNotice />
        </>
      ) : (
        <img
          {...uploadedImageProps(group.eventImageUrl, "128px")}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      )}
    </div>
  );
}

function studentRecruitments(group: HomeRecruitmentGroup) {
  return group.recruitments.filter(
    (recruitment): recruitment is IndexRecruitment & { student: NonNullable<IndexRecruitment["student"]> } =>
      recruitment.student !== null,
  );
}

function NextRecruitmentPreview({ groups, timeZone }: { groups: HomeRecruitmentGroup[]; timeZone: string }) {
  const firstGroup = groups[0];
  if (!firstGroup) return null;
  const nextDate = formatInstantDateKey(firstGroup.since, timeZone);
  const nextGroups = groups.filter((group) => formatInstantDateKey(group.since, timeZone) === nextDate);
  return (
    <Link
      to="/futures"
      className="flex min-w-0 items-center gap-3 rounded-lg bg-v2-surface px-v2-block-p py-2.5 transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs text-v2-fg-tertiary">
          다음 모집 · {formatInstant(firstGroup.since, { timeZone, format: "MM/DD" })} 시작
        </p>
        <ul className="mt-1.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2">
          {nextGroups.map((group) => {
            const students = studentRecruitments(group);
            return (
              <li key={group.groupUid} className="col-span-2 grid min-w-0 grid-cols-subgrid items-center">
                {students.length > 0 ? (
                  <div className="flex shrink-0 items-center -space-x-2">
                    {students.map((recruitment) => (
                      <StudentPortrait
                        key={recruitment.favoriteKey}
                        uid={recruitment.student.uid}
                        alt={recruitment.studentName}
                        className="size-8 rounded-full border-2 border-v2-surface object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 text-xs break-keep whitespace-pre-line text-v2-fg-secondary line-clamp-2">
                  {group.eventName ?? group.kindLabel}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-v2-fg-tertiary" />
    </Link>
  );
}

export function HomeRecruitmentSection({
  groups,
  upcomingGroups,
  viewer,
  now,
  timeZone,
  onRetry,
}: {
  groups: HomeSourceResult<HomeRecruitmentGroup[]>;
  upcomingGroups: HomeRecruitmentGroup[];
  viewer: HomeViewerState;
  now: UtcIsoString;
  timeZone: string;
  onRetry: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  // The counts are not part of this block's failure: the students show without their counts.
  if (groups.status === "error") {
    return (
      <HomeSection id="home-recruitment" title="학생 모집">
        <HomeTile label="학생 모집" name="일정을 불러오지 못했어요" detail={<HomeRetryButton onClick={onRetry} />} />
      </HomeSection>
    );
  }

  return (
    <HomeSection id="home-recruitment" title="학생 모집">
      {viewer.status === "failed" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-v2-surface p-v2-block-p">
          <p className="text-sm text-v2-fg">관심 학생과 모집 기록을 불러오지 못했어요</p>
          <HomeRetryButton onClick={onRetry} />
        </div>
      ) : null}
      {groups.data.length === 0 ? (
        <HomeEmpty>모집 중인 학생이 없어요</HomeEmpty>
      ) : (
        // Every group sits on one surface, with a divider between groups.
        <div className="divide-y divide-v2-divider/60 overflow-hidden rounded-lg bg-v2-surface">
          {groups.data.map((group) => {
            const students = group.recruitments.filter(
              (recruitment): recruitment is IndexRecruitment & { student: NonNullable<IndexRecruitment["student"]> } =>
                recruitment.student !== null,
            );
            return (
              <div key={group.groupUid} className="flex flex-col gap-2 px-v2-block-p py-3 md:gap-3 md:py-v2-block-p">
                {/* The kind label shares the first row with the chip, and the event name takes the full width below. */}
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-xs text-v2-fg-tertiary md:text-sm">{group.kindLabel}</p>
                    <HomeTimeChip chip={groupChip(group, now, timeZone)} dense />
                  </div>
                  {group.eventName ? (
                    <p className="text-base leading-6 font-semibold break-keep whitespace-pre-line text-v2-fg md:text-lg md:leading-7">
                      {group.eventUid ? (
                        <Link
                          to={`/events/${group.eventUid}`}
                          className="-mx-1 rounded-md px-1 transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus motion-reduce:transition-none"
                        >
                          <TrailingIconText text={group.eventName}>
                            <ChevronRightIcon
                              aria-hidden="true"
                              className="ml-1 inline-block size-4 align-middle text-v2-fg-tertiary"
                            />
                          </TrailingIconText>
                        </Link>
                      ) : (
                        group.eventName
                      )}
                    </p>
                  ) : null}
                </div>
                {students.length === 0 ? (
                  <GroupBanner group={group} />
                ) : (
                  <StudentThumbList size="large">
                    {students.map((recruitment) => {
                      const key = `${group.groupUid}:${recruitment.favoriteKey}`;
                      return (
                        <li
                          key={key}
                          className="[&_button]:transition-opacity [&_button]:duration-v2-fast [&_button]:ease-v2-standard [&_button:hover]:opacity-90 motion-reduce:[&_button]:transition-none"
                        >
                          <StudentSlot
                            entry={toStudentEntry({ group, recruitment, viewer, now })}
                            signedIn={viewer.signedIn}
                            large
                            open={openKey === key}
                            onOpenChange={(open) => setOpenKey(open ? key : null)}
                          />
                        </li>
                      );
                    })}
                  </StudentThumbList>
                )}
              </div>
            );
          })}
        </div>
      )}
      {upcomingGroups.length > 0 ? <NextRecruitmentPreview groups={upcomingGroups} timeZone={timeZone} /> : null}
    </HomeSection>
  );
}
