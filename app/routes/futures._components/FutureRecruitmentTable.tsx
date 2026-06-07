import { CheckCircleIcon as CheckCircleSolidIcon, StarIcon } from "@heroicons/react/16/solid";
import {
  CheckCircleIcon,
  HeartIcon as EmptyHeartIcon,
  IdentificationIcon,
  PencilSquareIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as FilledHeartIcon } from "@heroicons/react/24/solid";
import { useMemo } from "react";
import { Link } from "react-router";
import { StudentCard } from "~/components/features/students";
import { EmptyView } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, isInstantAfter, isInstantBefore, nowUtcIso } from "~/lib/date-time";
import { contentTypeLocale, recruitmentLabelLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import {
  type FutureRecruitmentTableContent,
  type FutureRecruitmentTableRecruitmentGroup,
  type FutureRecruitmentTableRow,
  buildFutureRecruitmentTableRows,
  formatAuxiliaryContentPeriodLabel,
  isFutureRecruitmentTableContentLinkable,
  isFutureRecruitmentTableContentVisible,
} from "./future-recruitment-table-model";

type FutureRecruitmentTableProps = {
  contents: FutureRecruitmentTableContent[];
  favoritedStudents: { contentUid: string; studentUid: string }[];
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[];
  completedRecruitmentStudents: { recruitmentGroupUid: string; studentUid: string }[];
  recruitmentResultEditLinks: { recruitmentGroupUid: string; link: string }[];
  revealedSpoilerContentUids: string[];
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
  ) => void;
};

export default function FutureRecruitmentTable({
  contents,
  favoritedStudents,
  favoritedCounts,
  completedRecruitmentStudents,
  recruitmentResultEditLinks,
  revealedSpoilerContentUids,
  onFavorite,
  onRecruitmentComplete,
}: FutureRecruitmentTableProps) {
  const timeZone = useDisplayTimeZone();
  const rows = useMemo(() => buildFutureRecruitmentTableRows(contents, timeZone), [contents, timeZone]);

  if (rows.length === 0) {
    return <EmptyView text="표로 표시할 모집 정보가 없어요." />;
  }

  return (
    <DesktopRecruitmentTable
      rows={rows}
      favoritedStudents={favoritedStudents}
      favoritedCounts={favoritedCounts}
      completedRecruitmentStudents={completedRecruitmentStudents}
      recruitmentResultEditLinks={recruitmentResultEditLinks}
      revealedSpoilerContentUids={revealedSpoilerContentUids}
      onFavorite={onFavorite}
      onRecruitmentComplete={onRecruitmentComplete}
    />
  );
}

function DesktopRecruitmentTable({
  rows,
  favoritedStudents,
  favoritedCounts,
  completedRecruitmentStudents,
  recruitmentResultEditLinks,
  revealedSpoilerContentUids,
  onFavorite,
  onRecruitmentComplete,
}: {
  rows: FutureRecruitmentTableRow[];
  favoritedStudents: { contentUid: string; studentUid: string }[];
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[];
  completedRecruitmentStudents: { recruitmentGroupUid: string; studentUid: string }[];
  recruitmentResultEditLinks: { recruitmentGroupUid: string; link: string }[];
  revealedSpoilerContentUids: string[];
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
  ) => void;
}) {
  return (
    <div className="hidden lg:block overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-14" />
          <col className="w-72" />
          <col />
        </colgroup>
        <thead className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          <tr>
            <TableHeader>기간</TableHeader>
            <TableHeader>모집 학생</TableHeader>
            <TableHeader>개최 컨텐츠</TableHeader>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.since}-${row.until}`}
              className="border-t border-neutral-200 align-top dark:border-neutral-700"
            >
              <TableCell>
                <PeriodLabel since={row.since} until={row.until} />
              </TableCell>
              {!row.hideRecruitmentCell && (
                <TableCell rowSpan={row.recruitmentRowSpan}>
                  <RecruitmentStudents
                    groups={row.recruitments}
                    favoritedStudents={favoritedStudents}
                    favoritedCounts={favoritedCounts}
                    completedRecruitmentStudents={completedRecruitmentStudents}
                    recruitmentResultEditLinks={recruitmentResultEditLinks}
                    onFavorite={onFavorite}
                    onRecruitmentComplete={onRecruitmentComplete}
                  />
                </TableCell>
              )}
              <TableCell>
                <AuxiliaryContents
                  contents={[...row.events, ...row.raids, ...row.campaigns]}
                  rowSince={row.since}
                  rowUntil={row.until}
                  revealedSpoilerContentUids={revealedSpoilerContentUids}
                />
              </TableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableHeader({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      className={`border-r border-neutral-200 px-2 py-2 text-left font-semibold last:border-r-0 dark:border-neutral-700 ${className}`}
    >
      {children}
    </th>
  );
}

function TableCell({ rowSpan, children }: { rowSpan?: number; children: React.ReactNode }) {
  return (
    <td rowSpan={rowSpan} className="border-r border-neutral-200 p-1.5 last:border-r-0 dark:border-neutral-700">
      {children}
    </td>
  );
}

function PeriodLabel({ since, until }: { since: string; until: string }) {
  const timeZone = useDisplayTimeZone();
  return (
    <div className="text-center text-xs font-semibold leading-tight text-neutral-800 dark:text-neutral-100">
      <p>{formatInstant(since, { timeZone, format: "MM/DD" })}</p>
      <p className="text-neutral-400 dark:text-neutral-500">↓</p>
      <p>{formatInstant(until, { timeZone, format: "MM/DD" })}</p>
    </div>
  );
}

function RecruitmentStudents({
  groups,
  favoritedStudents,
  favoritedCounts,
  completedRecruitmentStudents,
  recruitmentResultEditLinks,
  onFavorite,
  onRecruitmentComplete,
}: {
  groups: FutureRecruitmentTableRecruitmentGroup[];
  favoritedStudents: { contentUid: string; studentUid: string }[];
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[];
  completedRecruitmentStudents: { recruitmentGroupUid: string; studentUid: string }[];
  recruitmentResultEditLinks: { recruitmentGroupUid: string; link: string }[];
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void;
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
  ) => void;
}) {
  const groupedStudents = getRecruitmentContentStudentGroups(
    groups,
    favoritedStudents,
    favoritedCounts,
    completedRecruitmentStudents,
    recruitmentResultEditLinks,
    onFavorite,
    onRecruitmentComplete,
  );
  const now = nowUtcIso();
  if (groupedStudents.length === 0) {
    return null;
  }

  if (groupedStudents.length === 1) {
    return <RecruitmentContentStudentGroup group={groupedStudents[0]} now={now} showContentName={false} />;
  }

  return (
    <div className="space-y-3">
      {groupedStudents.map((group, index) => (
        <RecruitmentContentStudentGroup
          key={group.content.uid}
          group={group}
          now={now}
          showContentName
          className={index > 0 ? "border-t border-neutral-100 pt-2 dark:border-neutral-800" : undefined}
        />
      ))}
    </div>
  );
}

function RecruitmentContentStudentGroup({
  group,
  now,
  showContentName,
  className,
}: {
  group: FutureRecruitmentTableContentStudentGroup;
  now: string;
  showContentName: boolean;
  className?: string;
}) {
  const tags = getRecruitmentContentTags(group.content, now);
  const showHeader = showContentName || tags.length > 0;

  return (
    <div className={className ? `space-y-1 ${className}` : "space-y-1"}>
      {showHeader && (
        <div className="flex flex-wrap items-center gap-1">
          {showContentName && (
            <p className="whitespace-pre-line text-xs font-semibold leading-tight text-neutral-500 dark:text-neutral-400">
              {group.content.name}
            </p>
          )}
          {tags.map((tag) => (
            <RecruitmentContentTag key={tag.text} {...tag} />
          ))}
        </div>
      )}
      <RecruitmentStudentSections students={group.students} />
    </div>
  );
}

function RecruitmentContentTag({
  Icon,
  text,
  color,
}: {
  Icon?: React.ElementType;
  text: string;
  color: "current" | "green" | "yellow";
}) {
  if (color === "current") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
        <span className="inline-block size-2 rounded-full bg-red-600 animate-pulse dark:bg-red-400" />
        {text}
      </span>
    );
  }

  let className = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  if (color === "green") {
    className = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  }

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${className}`}>
      {Icon && <Icon className="size-3" />}
      {text}
    </span>
  );
}

function getRecruitmentContentTags(content: FutureRecruitmentTableContent, now: string) {
  const tags: { Icon?: React.ElementType; text: string; color: "current" | "green" | "yellow" }[] = [];
  if (isInstantBefore(content.startAt, now) && (content.endAt === null || isInstantAfter(content.endAt, now))) {
    tags.push({ text: "진행중", color: "current" });
  }

  if (content.confirmed && isInstantAfter(content.startAt, now)) {
    tags.push({ Icon: CheckCircleSolidIcon, text: "확정", color: "green" });
  }

  if (
    content.tags.includes("recruit_free_100") &&
    content.recruitments.every(({ until }) => until !== null && isInstantAfter(until, now))
  ) {
    tags.push({ Icon: StarIcon, text: "100회 무료", color: "yellow" });
  }

  return tags;
}

function RecruitmentStudentSections({ students }: { students: FutureRecruitmentTableStudent[] }) {
  const pickupStudents = students.filter((student) => student.pickup);
  const nonPickupStudents = students.filter((student) => !student.pickup);
  const showSections = pickupStudents.length > 0 && nonPickupStudents.length > 0;

  return (
    <div className="space-y-2">
      <RecruitmentStudentSection
        title={showSections ? "픽업 학생" : undefined}
        students={pickupStudents.length > 0 ? pickupStudents : students}
      />
      {showSections && <RecruitmentStudentSection title="픽업 대상 외 모집 가능 학생" students={nonPickupStudents} />}
    </div>
  );
}

function RecruitmentStudentSection({
  title,
  students,
}: {
  title?: string;
  students: FutureRecruitmentTableStudent[];
}) {
  if (students.length === 0) {
    return null;
  }

  return (
    <div className={title === "픽업 대상 외 모집 가능 학생" ? "space-y-1 pt-2" : "space-y-1"}>
      {title && <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{title}</p>}
      <div className="grid w-fit grid-cols-4 gap-x-1.5 gap-y-2">
        {students.map((student) => {
          const StatusIcon = student.completed ? CheckCircleIcon : student.favorited ? FilledHeartIcon : EmptyHeartIcon;

          return (
            <div key={student.uid ?? student.name} className="w-14 sm:w-16">
              <StudentCard
                uid={student.uid}
                name={student.name}
                attackType={student.attackType}
                defenseType={student.defenseType}
                role={student.role}
                label={student.label}
                namePlacement="overlay"
                popups={student.popups}
              />
              <div
                className={`mt-0.5 flex items-center justify-center gap-0.5 text-xs font-semibold leading-none ${student.completed ? "text-green-500 dark:text-green-400" : student.favorited ? "text-red-500 dark:text-red-400" : "text-neutral-500 dark:text-neutral-400"}`}
              >
                <StatusIcon className="size-3" />
                <span>{student.favoritedCount}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type FutureRecruitmentTableStudent = ReturnType<typeof getRecruitmentStudentGroup>;

type FutureRecruitmentTableContentStudentGroup = {
  content: FutureRecruitmentTableContent;
  students: FutureRecruitmentTableStudent[];
};

function getRecruitmentContentStudentGroups(
  groups: FutureRecruitmentTableRecruitmentGroup[],
  favoritedStudents: { contentUid: string; studentUid: string }[],
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[],
  completedRecruitmentStudents: { recruitmentGroupUid: string; studentUid: string }[],
  recruitmentResultEditLinks: { recruitmentGroupUid: string; link: string }[],
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void,
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
  ) => void,
) {
  const contentGroups: FutureRecruitmentTableContentStudentGroup[] = [];

  for (const group of groups) {
    let contentGroup = contentGroups.find((item) => item.content.uid === group.content.uid);
    if (!contentGroup) {
      contentGroup = {
        content: group.content,
        students: [],
      };
      contentGroups.push(contentGroup);
    }

    contentGroup.students.push(
      getRecruitmentStudentGroup(
        group,
        favoritedStudents,
        favoritedCounts,
        completedRecruitmentStudents,
        recruitmentResultEditLinks,
        onFavorite,
        onRecruitmentComplete,
      ),
    );
  }

  return contentGroups;
}

function getRecruitmentStudentGroup(
  group: FutureRecruitmentTableRecruitmentGroup,
  favoritedStudents: { contentUid: string; studentUid: string }[],
  favoritedCounts: { contentUid: string; studentUid: string; count: number }[],
  completedRecruitmentStudents: { recruitmentGroupUid: string; studentUid: string }[],
  recruitmentResultEditLinks: { recruitmentGroupUid: string; link: string }[],
  onFavorite?: (contentUid: string, studentUid: string, favorited: boolean) => void,
  onRecruitmentComplete?: (
    contentUid: string,
    recruitmentGroupUid: string,
    studentUid: string,
    completed: boolean,
  ) => void,
) {
  const recruitment = group.recruitment;
  const studentUid = recruitment.student?.uid ?? null;
  const favorited = studentUid
    ? favoritedStudents.some((item) => item.contentUid === group.content.uid && item.studentUid === studentUid)
    : false;
  const favoritedCount = studentUid
    ? favoritedCounts.find((item) => item.contentUid === group.content.uid && item.studentUid === studentUid)?.count
    : undefined;
  const label = recruitmentLabelLocale(recruitment);
  const completed = Boolean(
    group.content.recruitmentGroupUid &&
      studentUid &&
      completedRecruitmentStudents.some(
        (student) =>
          student.recruitmentGroupUid === group.content.recruitmentGroupUid && student.studentUid === studentUid,
      ),
  );
  const resultEditLink = group.content.recruitmentGroupUid
    ? recruitmentResultEditLinks.find((item) => item.recruitmentGroupUid === group.content.recruitmentGroupUid)?.link
    : undefined;

  return {
    uid: studentUid,
    name: recruitment.studentName,
    attackType: recruitment.student?.attackType,
    defenseType: recruitment.student?.defenseType,
    role: recruitment.student?.role,
    schaleDbId: recruitment.student?.schaleDbId,
    label,
    completed,
    pickup: recruitment.pickup,
    favorited,
    favoritedCount: favoritedCount ?? 0,
    popups: studentUid
      ? [
          favorited
            ? {
                Icon: FilledHeartIcon,
                text: "관심 학생에서 해제",
                onClick: () => onFavorite?.(group.content.uid, studentUid, false),
              }
            : {
                Icon: EmptyHeartIcon,
                text: "관심 학생에 등록",
                onClick: () => onFavorite?.(group.content.uid, studentUid, true),
              },
          ...(onRecruitmentComplete && group.content.recruitmentGroupUid
            ? [
                completed
                  ? {
                      Icon: XCircleIcon,
                      text: "모집 완료 취소",
                      onClick: () =>
                        onRecruitmentComplete(group.content.uid, group.content.recruitmentGroupUid as string, studentUid, false),
                    }
                  : {
                      Icon: CheckCircleIcon,
                      text: "모집 완료로 표시",
                      onClick: () =>
                        onRecruitmentComplete(group.content.uid, group.content.recruitmentGroupUid as string, studentUid, true),
                    },
              ]
            : []),
          ...(resultEditLink
            ? [
                {
                  Icon: PencilSquareIcon,
                  text: "모집 결과 상세 입력/수정",
                  link: resultEditLink,
                },
              ]
            : []),
          {
            Icon: IdentificationIcon,
            text: "학생부 보기 (평가/통계)",
            link: `/students/${studentUid}`,
          },
        ]
      : undefined,
  };
}

function AuxiliaryContents({
  contents,
  rowSince,
  rowUntil,
  revealedSpoilerContentUids,
}: {
  contents: FutureRecruitmentTableContent[];
  rowSince: string;
  rowUntil: string;
  revealedSpoilerContentUids: string[];
}) {
  if (contents.length === 0) {
    return <span className="text-neutral-400 dark:text-neutral-500">-</span>;
  }

  const visibleContents = contents.filter((content) =>
    isFutureRecruitmentTableContentVisible(content, revealedSpoilerContentUids.includes(content.uid)),
  );

  if (visibleContents.length === 0) {
    return <span className="text-neutral-400 dark:text-neutral-500">-</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {visibleContents.map((content) => {
        const name = getVisibleContentName(content, revealedSpoilerContentUids);
        return (
          <AuxiliaryContentItem
            key={content.uid}
            content={content}
            name={name}
            rowSince={rowSince}
            rowUntil={rowUntil}
            revealedSpoilerContentUids={revealedSpoilerContentUids}
          />
        );
      })}
    </div>
  );
}

function AuxiliaryContentItem({
  content,
  name,
  rowSince,
  rowUntil,
  revealedSpoilerContentUids,
}: {
  content: FutureRecruitmentTableContent;
  name: string;
  rowSince: string;
  rowUntil: string;
  revealedSpoilerContentUids: string[];
}) {
  const timeZone = useDisplayTimeZone();
  const title = content.raidInfo ? content.raidInfo.name : name;
  const label = getAuxiliaryContentTypeLabel(content);
  const imageUrl = content.raidInfo ? bossImageUrl(content.raidInfo.boss) : content.imageUrl;
  const spoilerRevealed = revealedSpoilerContentUids.includes(content.uid);
  const periodLabel = formatAuxiliaryContentPeriodLabel({
    contentStartAt: content.startAt,
    contentEndAt: content.endAt,
    contentEndless: content.endless,
    rowSince,
    rowUntil,
    timeZone,
  });
  const link = content.link;
  const linkable = link !== undefined && isFutureRecruitmentTableContentLinkable(content, spoilerRevealed);
  const body = (
    <span
      className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left ${linkable ? "group hover:bg-neutral-100 dark:hover:bg-neutral-800" : ""}`}
    >
      {imageUrl && (
        <img className="size-10 shrink-0 rounded-sm object-cover" src={imageUrl} alt={title} loading="lazy" />
      )}
      {!imageUrl && (
        <span className="size-10 shrink-0 rounded-sm bg-neutral-100 dark:bg-neutral-800" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</span>
        <span
          className={`block whitespace-pre-line text-sm font-semibold leading-tight text-neutral-800 dark:text-neutral-100 ${linkable ? "group-hover:underline" : ""}`}
        >
          {title}
        </span>
        {periodLabel && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{periodLabel}</span>}
      </span>
    </span>
  );

  if (linkable) {
    return <Link to={link}>{body}</Link>;
  }

  return body;
}

function getAuxiliaryContentTypeLabel(content: FutureRecruitmentTableContent): string {
  if (content.raidInfo) {
    return contentTypeLocale[content.raidInfo.raidType];
  }

  if ((content.contentType === "event" || content.contentType === "pickup") && content.runType === "rerun") {
    return `복각 ${contentTypeLocale[content.contentType]}`;
  }

  if (content.contentType === "event" && content.runType === "permanent") {
    return "이벤트 상설화";
  }

  return contentTypeLocale[content.contentType];
}

function getVisibleContentName(content: FutureRecruitmentTableContent, revealedSpoilerContentUids: string[]): string {
  if (content.isSpoiler && !revealedSpoilerContentUids.includes(content.uid)) {
    return "스포일러";
  }
  return content.name;
}
