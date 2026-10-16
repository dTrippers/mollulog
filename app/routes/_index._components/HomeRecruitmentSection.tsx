import { useState } from "react";
import { StudentSlot } from "~/components/v2/features/students/StudentSlot";
import type { FutureStudentEntry } from "~/components/v2/features/students/types";
import { getHomeOngoingChip, getHomeUpcomingChip } from "~/domain/home-portal";
import { canCompleteRecruitmentStudent } from "~/domain/recruitment-result";
import type { UtcIsoString } from "~/lib/date-time";
import { recruitmentLabelLocale } from "~/locales/ko";
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

function GroupBanner({ group }: { group: HomeRecruitmentGroup }) {
  const name = group.eventName ?? group.kindLabel;
  return (
    <div className="flex items-center gap-3">
      {group.eventImageUrl ? (
        <img
          src={group.eventImageUrl}
          alt=""
          loading="lazy"
          className="aspect-[16/9] w-32 shrink-0 rounded-md object-cover"
        />
      ) : null}
      <p className="min-w-0 text-lg font-semibold break-keep text-v2-fg">{name}</p>
    </div>
  );
}

export function HomeRecruitmentSection({
  groups,
  viewer,
  now,
  timeZone,
  onRetry,
}: {
  groups: HomeSourceResult<HomeRecruitmentGroup[]>;
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
        <div className="divide-y divide-v2-control-border overflow-hidden rounded-lg bg-v2-surface">
          {groups.data.map((group) => {
            const students = group.recruitments.filter(
              (recruitment): recruitment is IndexRecruitment & { student: NonNullable<IndexRecruitment["student"]> } =>
                recruitment.student !== null,
            );
            const kind = group.eventName ? `${group.kindLabel} · ${group.eventName}` : group.kindLabel;
            return (
              <div key={group.groupUid} className="flex flex-col gap-2 px-v2-block-p py-3 md:gap-3 md:py-v2-block-p">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm text-v2-fg-tertiary">{kind}</p>
                  <HomeTimeChip chip={groupChip(group, now, timeZone)} />
                </div>
                {students.length === 0 ? (
                  <GroupBanner group={group} />
                ) : (
                  <ul className="flex flex-wrap gap-x-3 gap-y-4">
                    {students.map((recruitment) => {
                      const key = `${group.groupUid}:${recruitment.favoriteKey}`;
                      return (
                        <li key={key}>
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
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </HomeSection>
  );
}
