import {
  CheckCircleIcon as CheckCircleSolidIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  RectangleStackIcon,
  Squares2X2Icon,
  StarIcon,
} from "@heroicons/react/16/solid";
import { ClockIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import type { FutureContentGroup } from "~/domain/futures/content-timeline-grouping";
import {
  type FutureSpecialCase,
  formatContentPeriod,
  getCautionText,
  getDayDividerParts,
  getFutureSpecialCases,
  getRemainingTime,
  groupRecruitmentsByPeriod,
  isOngoingFutureContent,
  selectFutureMediaSource,
} from "~/domain/futures/futures-view-model";
import { formatInstant, formatInstantDateKey, isInstantAfter, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  difficultyLocale,
  terrainLocale,
} from "~/locales/ko";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { StudentSlot } from "../students/StudentSlot";
import { ContentMedia } from "./ContentMedia";
import { FeatureBanner } from "./FeatureBanner";
import { getFutureMediaTypeLabel } from "./labels";
import { OpinionRow } from "./OpinionRow";
import { RemainingLabel } from "./RemainingLabel";
import type { FutureBannerId, FutureViewContent } from "./types";

export type FutureTimelineProps = {
  groups: FutureContentGroup<FutureViewContent>[];
  now: UtcIsoString;
  timeZone: string;
  signedIn: boolean;
  revealedSpoilers: ReadonlySet<string>;
  // Null until the saved dismissals are read. No hint shows before then, so the page does not flash or shift.
  dismissedBanners: ReadonlySet<FutureBannerId> | null;
  onRevealSpoiler: (contentUid: string) => void;
  onHideSpoiler: (contentUid: string) => void;
  onDismissBanner: (bannerId: FutureBannerId) => void;
  onOpenOpinion: (contentUid: string) => void;
  onOpenContent: (contentUid: string) => void;
};

// Feed of contents by date. Dates are dividers, not cards: the first group is the in-progress group. The items of one
// group join on the left media column, and the join breaks at the next divider.
export function FutureTimeline(props: FutureTimelineProps) {
  return (
    <div className="space-y-2">
      {props.groups.map((group) => {
        const dateKey = group.groupDate ? formatInstantDateKey(group.groupDate, props.timeZone) : "live";
        return (
          <section key={dateKey} aria-label={group.groupDate ? undefined : "진행 중"}>
            <DateDivider groupDate={group.groupDate} now={props.now} timeZone={props.timeZone} />
            <ol>
              {group.contents.map((content, index) => (
                <li key={content.uid}>
                  <TimelineItem content={content} connectsNext={index < group.contents.length - 1} {...props} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function DateDivider({
  groupDate,
  now,
  timeZone,
}: {
  groupDate: UtcIsoString | null;
  now: UtcIsoString;
  timeZone: string;
}) {
  if (groupDate === null) {
    return (
      <div className="flex items-center gap-3 pt-2 pb-3">
        <span className="shrink-0 text-xs font-semibold text-v2-live">● 진행 중</span>
        <span aria-hidden="true" className="h-px flex-1 bg-v2-inset" />
      </div>
    );
  }
  const parts = getDayDividerParts(groupDate, now, timeZone);
  return (
    <div className="flex items-center gap-3 pt-2 pb-3">
      <p className="flex shrink-0 items-baseline gap-2 text-xs text-v2-fg">
        <span className="font-semibold tabular-nums">{parts.dateText}</span>
        <span className="text-xs text-v2-fg-tertiary tabular-nums">{parts.relativeText}</span>
      </p>
      <span aria-hidden="true" className="h-px flex-1 bg-v2-inset" />
    </div>
  );
}

function TimelineItem({
  content,
  connectsNext,
  now,
  timeZone,
  signedIn,
  revealedSpoilers,
  dismissedBanners,
  onRevealSpoiler,
  onHideSpoiler,
  onDismissBanner,
  onOpenOpinion,
  onOpenContent,
}: { content: FutureViewContent; connectsNext: boolean } & FutureTimelineProps) {
  const [openStudentKey, setOpenStudentKey] = useState<string | null>(null);
  const revealed = revealedSpoilers.has(content.uid);
  const hidden = content.isSpoiler && !revealed;
  const isRaid = content.raid !== null;
  const linkable = content.linkable && !hidden;
  const ongoing = isOngoingFutureContent(content.since, content.until, now);
  const remaining =
    ongoing && content.until && !content.endless ? getRemainingTime(content.until, now, timeZone) : null;
  const specialCases = getFutureSpecialCases({
    contentType: content.contentType,
    tags: content.tags,
    recruitments: content.students,
    recruitmentGroupUid: content.recruitmentGroupUid,
    recruitmentPeriod: content.recruitmentPeriod,
    since: content.since,
    until: content.until,
    endless: content.endless,
    now,
    timeZone,
  });
  const typeLabel = getFutureMediaTypeLabel(content);
  const cautionText = specialCases.map(getCautionText).find((label): label is string => label !== null) ?? null;
  const mediaSource = selectFutureMediaSource({
    hidden,
    isRaid,
    boss: content.raid?.boss ?? null,
    logoContentUid: content.logoContentUid,
  });
  const studentAnalysisKey = content.studentAnalysisFavoriteKey;
  const pendingKey = content.pendingFavoriteKey;
  const bannerShown = (bannerId: FutureBannerId) => dismissedBanners !== null && !dismissedBanners.has(bannerId);
  const studentAnalysisBanner = !hidden && studentAnalysisKey && bannerShown("student-analysis");
  const pendingBanner = !hidden && pendingKey && bannerShown("pending-student-favorite");

  const title = hidden ? null : linkable ? (
    <Link
      to={content.link}
      state={content.navigationState}
      prefetch="intent"
      className={cn("group block text-base font-semibold whitespace-pre-line text-v2-fg hover:underline", v2FocusRing)}
      {...getV2LinkTransitionProps("forward", () => onOpenContent(content.uid))}
    >
      {content.name}
      <ChevronRightIcon aria-hidden="true" className="ml-1 inline-block size-4 align-middle text-v2-fg-tertiary" />
    </Link>
  ) : (
    <p className="text-base font-semibold whitespace-pre-line text-v2-fg">{content.name}</p>
  );

  return (
    <article
      data-futures-content-uid={content.uid}
      className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 pb-7 md:grid-cols-[2.75rem_minmax(0,1fr)] md:gap-x-4 lg:grid-cols-[3rem_minmax(0,1fr)]"
    >
      {connectsNext ? (
        <span
          aria-hidden="true"
          className="absolute top-12 -bottom-5 left-5 w-px bg-v2-divider md:left-[1.375rem] lg:left-6"
        />
      ) : null}
      <div className="relative z-10">
        <ContentMedia source={mediaSource} contentType={content.contentType} typeLabel={typeLabel} size="timeline" />
      </div>

      <div className="min-w-0 space-y-2">
        {hidden ? (
          <div className="space-y-1">
            <p className="text-base font-semibold text-v2-fg">스포일러가 포함되어 있어요</p>
            <Button variant="secondary" className="h-8" onClick={() => onRevealSpoiler(content.uid)}>
              <EyeIcon className="size-4" aria-hidden="true" />
              내용 보기
            </Button>
          </div>
        ) : (
          title
        )}

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-v2-fg-secondary">
          <span>{typeLabel}</span>
          <MetaSeparatorAnd>
            <span className="tabular-nums">
              {formatContentPeriod({
                since: content.since,
                until: content.until,
                endless: content.endless,
                contentType: content.contentType,
                timeZone,
              })}
            </span>
          </MetaSeparatorAnd>
          {remaining ? (
            <MetaSeparatorAnd>
              <RemainingLabel remaining={remaining} />
            </MetaSeparatorAnd>
          ) : null}
          {content.minigameType ? <MinigameMark minigameType={content.minigameType} /> : null}
          {content.confirmed && isInstantAfter(content.since, now) ? (
            <MetaSeparatorAnd>
              <span className="inline-flex items-center gap-1 font-semibold text-v2-success">
                <CheckCircleSolidIcon className="size-3.5" aria-hidden="true" />
                확정
              </span>
            </MetaSeparatorAnd>
          ) : null}
          {content.tags.includes("shop") ? <MetaSeparatorAnd>이벤트 상점</MetaSeparatorAnd> : null}
          {specialCases.map((specialCase) => (
            <SpecialCaseChip key={specialCase.kind} specialCase={specialCase} />
          ))}
        </div>

        {isRaid && !hidden && content.raid ? <RaidSummary raid={content.raid} /> : null}

        {revealed && content.isSpoiler ? (
          <Button variant="text" className="h-8 px-2 text-xs" onClick={() => onHideSpoiler(content.uid)}>
            <EyeSlashIcon className="size-4" aria-hidden="true" />
            다시 가리기
          </Button>
        ) : null}

        {hidden ? null : (
          <>
            {cautionText ? (
              <p className="inline-flex items-center gap-1 text-xs font-semibold text-v2-warning">
                <ClockIcon className="size-3.5" aria-hidden="true" />
                {cautionText}
              </p>
            ) : null}
            <FutureStudents
              content={content}
              timeZone={timeZone}
              signedIn={signedIn}
              openKey={openStudentKey}
              onOpenKeyChange={setOpenStudentKey}
            />
            {studentAnalysisBanner || pendingBanner ? (
              <div className="space-y-2">
                {studentAnalysisBanner ? (
                  <FeatureBanner
                    message="학생부에서 통계 분석을 보고 모집 여부를 판단해보세요"
                    actionLabel="확인하기"
                    onAction={() => setOpenStudentKey(studentAnalysisKey)}
                    onDismiss={() => onDismissBanner("student-analysis")}
                  />
                ) : null}
                {pendingBanner ? (
                  <FeatureBanner
                    message="데이터를 준비중인 학생도 관심 학생에 등록할 수 있어요"
                    actionLabel="확인하기"
                    onAction={() => setOpenStudentKey(pendingKey)}
                    onDismiss={() => onDismissBanner("pending-student-favorite")}
                  />
                ) : null}
              </div>
            ) : null}
            {content.resultEditLink ? (
              <Link
                to={content.resultEditLink}
                prefetch="intent"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg",
                  v2FocusRing,
                )}
                {...getV2LinkTransitionProps("forward")}
              >
                <PencilSquareIcon className="size-4" aria-hidden="true" />
                모집 결과 데이터 상세 입력
              </Link>
            ) : null}
          </>
        )}
        {content.opinion ? <OpinionRow opinion={content.opinion} onOpen={() => onOpenOpinion(content.uid)} /> : null}
      </div>
    </article>
  );
}

function MetaSeparatorAnd({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="text-v2-fg-disabled">
        ·
      </span>
      {children}
    </>
  );
}

function MinigameMark({ minigameType }: { minigameType: string }) {
  const label = minigameLabel(minigameType);
  if (label === null) {
    return null;
  }
  const Icon = minigameType === "treasure_hunt" ? Squares2X2Icon : RectangleStackIcon;
  return (
    <MetaSeparatorAnd>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-3.5 text-v2-fg-tertiary" aria-hidden="true" />
        {label}
      </span>
    </MetaSeparatorAnd>
  );
}

function SpecialCaseChip({ specialCase }: { specialCase: FutureSpecialCase }) {
  if (specialCase.kind === "perk-free-100") {
    return (
      <MetaSeparatorAnd>
        <span className="inline-flex items-center gap-1 font-semibold text-v2-perk">
          <StarIcon className="size-3.5" aria-hidden="true" />
          100회 무료
        </span>
      </MetaSeparatorAnd>
    );
  }
  // Caution notes are shown as their own row under the meta line.
  return null;
}

// Terrain, attack, and defense of a raid. The home raid tiles and the timeline share it.
export function RaidSummary({
  raid,
}: {
  raid: Pick<NonNullable<FutureViewContent["raid"]>, "terrain" | "attackType" | "defenseTypes">;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-v2-fg-secondary">
      <span>{terrainLocale[raid.terrain]}</span>
      {raid.attackType ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-3 w-0.5 rounded-full bg-v2-attr-${attackTypeColor[raid.attackType]}`}
          />
          {attackTypeLocale[raid.attackType]}
        </span>
      ) : null}
      {raid.defenseTypes.map((defense) => (
        <span key={defense.defenseType} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-3 w-0.5 rounded-full bg-v2-attr-${defenseTypeColor[defense.defenseType]}`}
          />
          {defenseTypeLocale[defense.defenseType]}
          {defense.difficulty ? (
            <span className="text-v2-fg-tertiary">{difficultyLocale[defense.difficulty] ?? defense.difficulty}</span>
          ) : null}
        </span>
      ))}
    </p>
  );
}

function FutureStudents({
  content,
  timeZone,
  signedIn,
  openKey,
  onOpenKeyChange,
}: {
  content: FutureViewContent;
  timeZone: string;
  signedIn: boolean;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
}) {
  const fesRestriction = content.contentType === "fes";
  return (
    <div className="space-y-3">
      {fesRestriction ? (
        <p className="inline-flex items-center gap-1 text-xs font-semibold text-v2-warning">
          <ClockIcon className="size-3.5" aria-hidden="true" />
          픽업 외 학생은 모집 포인트(천장)로 교환할 수 없어요.
        </p>
      ) : null}
      {!fesRestriction && content.students.length > 0 ? (
        <RecruitmentStudents
          entries={content.students}
          timeZone={timeZone}
          signedIn={signedIn}
          openKey={openKey}
          onOpenKeyChange={onOpenKeyChange}
        />
      ) : null}
    </div>
  );
}

function RecruitmentStudents({
  entries,
  timeZone,
  signedIn,
  openKey,
  onOpenKeyChange,
}: {
  entries: FutureViewContent["students"];
  timeZone: string;
  signedIn: boolean;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
}) {
  const periodGroups = groupRecruitmentsByPeriod(entries, timeZone);
  const showPeriodHeaders = periodGroups.length >= 2;
  return (
    <div className="space-y-3">
      {periodGroups.map((periodGroup) => {
        const pickups = periodGroup.recruitments.filter((entry) => entry.pickup);
        const others = periodGroup.recruitments.filter((entry) => !entry.pickup);
        const sinceText = formatInstant(periodGroup.since, { timeZone, format: "MM/DD" });
        return (
          <div key={periodGroup.key} className="space-y-2">
            {showPeriodHeaders ? (
              <p className="text-xs font-semibold text-v2-fg-tertiary tabular-nums">
                {`${sinceText} ~ ${
                  periodGroup.until ? formatInstant(periodGroup.until, { timeZone, format: "MM/DD" }) : "미정"
                }`}
              </p>
            ) : null}
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              {pickups.length > 0 ? (
                <StudentBlock
                  label={others.length > 0 ? "픽업" : null}
                  entries={pickups}
                  signedIn={signedIn}
                  openKey={openKey}
                  onOpenKeyChange={onOpenKeyChange}
                />
              ) : null}
              {others.length > 0 ? (
                <StudentBlock
                  label={pickups.length > 0 ? "픽업 외 모집 가능" : null}
                  entries={others}
                  signedIn={signedIn}
                  openKey={openKey}
                  onOpenKeyChange={onOpenKeyChange}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StudentBlock({
  label,
  entries,
  signedIn,
  openKey,
  onOpenKeyChange,
}: {
  label: string | null;
  entries: FutureViewContent["students"];
  signedIn: boolean;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {label ? <p className="text-xs text-v2-fg-tertiary">{label}</p> : null}
      <ul className="grid grid-cols-5 gap-x-2 gap-y-3 md:flex md:flex-wrap md:gap-3">
        {entries.map((entry) => (
          <li key={entry.favoriteKey} className="min-w-0">
            <StudentSlot
              entry={entry}
              signedIn={signedIn}
              open={openKey === entry.favoriteKey}
              onOpenChange={(open) => onOpenKeyChange(open ? entry.favoriteKey : null)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function minigameLabel(minigameType: string): string | null {
  if (minigameType === "treasure_hunt") {
    return "보물찾기";
  }
  if (minigameType === "card_flip") {
    return "카드 뒤집기";
  }
  return null;
}
