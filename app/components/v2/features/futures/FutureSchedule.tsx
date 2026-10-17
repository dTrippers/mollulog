import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  buildFutureRecruitmentTableRows,
  type FutureRecruitmentTableContent,
  type FutureRecruitmentTableRow,
  formatAuxiliaryContentPeriodLabel,
  isFutureRecruitmentTableContentLinkable,
  isFutureRecruitmentTableContentVisible,
} from "~/domain/futures/future-recruitment-table-model";
import { selectFutureMediaSource } from "~/domain/futures/futures-view-model";
import { buildScheduleGroups } from "~/domain/futures/schedule-recruitment-groups";
import { formatInstant, isInstantAfter, isInstantBefore, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { StudentSlot } from "../students/StudentSlot";
import type { FutureStudentEntry } from "../students/types";
import { ContentMedia } from "./ContentMedia";
import { getFutureMediaTypeLabel } from "./labels";
import type { FutureViewContent } from "./types";

export type FutureScheduleProps = {
  contents: FutureViewContent[];
  now: UtcIsoString;
  timeZone: string;
  signedIn: boolean;
  revealedSpoilers: ReadonlySet<string>;
  onRevealSpoiler: (contentUid: string) => void;
  onOpenContent: (contentUid: string) => void;
};

// Schedule table for desktop. Period, recruited students, and held contents sit in three columns. A hidden spoiler hides
// its row content and the students of that content.
export function FutureSchedule({
  contents,
  now,
  timeZone,
  signedIn,
  revealedSpoilers,
  onRevealSpoiler,
  onOpenContent,
}: FutureScheduleProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const byUid = useMemo(() => new Map(contents.map((content) => [content.uid, content])), [contents]);
  const tableContents = useMemo<FutureRecruitmentTableContent[]>(
    () =>
      contents.map((content) => ({
        uid: content.uid,
        recruitmentGroupUid: content.recruitmentGroupUid,
        name: content.name,
        link: content.link,
        imageUrl: null,
        startAt: content.since,
        endAt: content.until,
        endless: content.endless,
        contentType: content.raid ? "raid" : content.contentType,
        runType: content.runType,
        confirmed: content.confirmed,
        isSpoiler: content.isSpoiler,
        tags: content.tags,
        recruitments: content.students.map((entry) => ({
          recruitmentType: entry.recruitmentType,
          pickup: entry.pickup,
          rerun: entry.rerun,
          since: entry.since,
          until: entry.until,
          studentName: entry.studentName,
          favoriteKey: entry.favoriteKey,
          student: entry.studentUid
            ? {
                uid: entry.studentUid,
                attackType: entry.attackType,
                defenseType: entry.defenseType,
                role: entry.role,
                initialTier: entry.completionMeta.tier,
              }
            : null,
        })),
        raidInfo: content.raid
          ? {
              raidType: content.raid.raidType,
              boss: content.raid.boss,
              name: content.raid.name,
              terrain: content.raid.terrain,
              attackType: content.raid.attackType,
              defenseTypes: content.raid.defenseTypes,
            }
          : undefined,
      })),
    [contents],
  );
  const rows = useMemo(() => buildFutureRecruitmentTableRows(tableContents, timeZone), [tableContents, timeZone]);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-v2-surface p-v2-block-p text-sm text-v2-fg-secondary">
        표로 표시할 모집 정보가 없어요.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg bg-v2-surface">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-20" />
          <col className="w-[35%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-xs font-semibold text-v2-fg-tertiary">
            <th scope="col" className="px-3 py-2 text-right">
              기간
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              모집 학생
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              개최 컨텐츠
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ScheduleRow
              key={row.since}
              row={row}
              now={now}
              timeZone={timeZone}
              signedIn={signedIn}
              byUid={byUid}
              revealedSpoilers={revealedSpoilers}
              openKey={openKey}
              onOpenKeyChange={setOpenKey}
              onRevealSpoiler={onRevealSpoiler}
              onOpenContent={onOpenContent}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleRow({
  row,
  now,
  timeZone,
  signedIn,
  byUid,
  revealedSpoilers,
  openKey,
  onOpenKeyChange,
  onRevealSpoiler,
  onOpenContent,
}: {
  row: FutureRecruitmentTableRow;
  now: UtcIsoString;
  timeZone: string;
  signedIn: boolean;
  byUid: Map<string, FutureViewContent>;
  revealedSpoilers: ReadonlySet<string>;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
  onRevealSpoiler: (contentUid: string) => void;
  onOpenContent: (contentUid: string) => void;
}) {
  const ongoing = isInstantBefore(row.since, now) && isInstantAfter(row.until, now);
  const heldContents = [...row.events, ...row.raids, ...row.campaigns];
  const groups = groupRecruitmentsForRow(row, byUid, revealedSpoilers);
  const scheduleGroups = buildScheduleGroups(groups, { since: row.since, until: row.until }, timeZone);

  return (
    <tr className="border-t border-v2-inset align-top">
      <td className="px-3 py-3 text-right tabular-nums">
        <p className="text-v2-fg">{formatInstant(row.since, { timeZone, format: "MM/DD" })}</p>
        <p className="text-xs text-v2-fg-tertiary">~ {formatInstant(row.until, { timeZone, format: "MM/DD" })}</p>
      </td>
      {!row.hideRecruitmentCell ? (
        <td rowSpan={row.recruitmentRowSpan} className="px-3 py-3">
          <div className="space-y-3">
            {ongoing ? <p className="text-xs font-semibold text-v2-live">● 진행 중</p> : null}
            <div className="space-y-5">
              {scheduleGroups.map((group) => (
                <div key={group.uid} className="space-y-2">
                  {group.showName || group.showPeriod ? (
                    <p className="flex items-baseline gap-1.5 text-xs">
                      {group.showName ? <span className="font-medium whitespace-pre-line text-v2-fg-secondary">{group.name}</span> : null}
                      {group.showPeriod ? (
                        <span className="text-v2-fg-tertiary tabular-nums">
                          {`${formatInstant(group.since, { timeZone, format: "MM/DD" })} ~ ${
                            group.until ? formatInstant(group.until, { timeZone, format: "MM/DD" }) : "미정"
                          }`}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {group.sections.map((section) => (
                    <div key={section.key} className={section.key === "others" ? "mt-3 space-y-2" : "space-y-2"}>
                      {section.title ? <p className="text-xs text-v2-fg-tertiary">{section.title}</p> : null}
                      <ul className="flex flex-wrap gap-3">
                        {section.entries.map((entry) => (
                          <li key={entry.favoriteKey}>
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
                  ))}
                </div>
              ))}
            </div>
          </div>
        </td>
      ) : null}
      <td className="border-l border-v2-inset px-3 py-3">
        <div className="space-y-3">
          {heldContents.map((content) => (
            <HeldContent
              key={content.uid}
              content={content}
              view={byUid.get(content.uid)}
              row={row}
              timeZone={timeZone}
              revealed={revealedSpoilers.has(content.uid)}
              onRevealSpoiler={onRevealSpoiler}
              onOpenContent={onOpenContent}
            />
          ))}
        </div>
      </td>
    </tr>
  );
}

function groupRecruitmentsForRow(
  row: FutureRecruitmentTableRow,
  byUid: Map<string, FutureViewContent>,
  revealedSpoilers: ReadonlySet<string>,
) {
  const groups: { uid: string; name: string; entries: FutureStudentEntry[]; contentUntil: UtcIsoString | null }[] = [];
  for (const group of row.recruitments) {
    const content = byUid.get(group.content.uid);
    if (!content || !isFutureRecruitmentTableContentVisible(group.content, revealedSpoilers.has(group.content.uid))) {
      continue;
    }
    const entry = content.students.find((student) => student.favoriteKey === group.recruitment.favoriteKey);
    if (!entry) {
      continue;
    }
    const existing = groups.find((item) => item.uid === content.uid);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.push({
        uid: content.uid,
        name: content.name,
        entries: [entry],
        contentUntil: content.until,
      });
    }
  }
  return groups;
}

function HeldContent({
  content,
  view,
  row,
  timeZone,
  revealed,
  onRevealSpoiler,
  onOpenContent,
}: {
  content: FutureRecruitmentTableContent;
  view: FutureViewContent | undefined;
  row: FutureRecruitmentTableRow;
  timeZone: string;
  revealed: boolean;
  onRevealSpoiler: (contentUid: string) => void;
  onOpenContent: (contentUid: string) => void;
}) {
  if (!view) {
    return null;
  }
  const visible = isFutureRecruitmentTableContentVisible(content, revealed);
  const linkable = isFutureRecruitmentTableContentLinkable(content, revealed);
  const periodLabel = formatAuxiliaryContentPeriodLabel({
    contentStartAt: content.startAt,
    contentEndAt: content.endAt,
    contentEndless: content.endless,
    rowSince: row.since,
    rowUntil: row.until,
    timeZone,
    contentType: content.contentType,
  });
  const typeLabel = getFutureMediaTypeLabel(view);
  const name = content.name;

  if (!visible) {
    return (
      <div className="flex min-h-v2-row-min items-center gap-2">
        <span className="text-sm font-semibold text-v2-fg">스포일러가 포함되어 있어요</span>
        <Button variant="secondary" className="h-7 px-2 text-xs" onClick={() => onRevealSpoiler(content.uid)}>
          내용 보기
        </Button>
      </div>
    );
  }

  const body = (
    <div className="flex min-w-0 items-center gap-3">
      <ContentMedia
        source={selectFutureMediaSource({
          hidden: false,
          isRaid: view.raid !== null,
          boss: view.raid?.boss ?? null,
          logoContentUid: view.logoContentUid,
        })}
        contentType={view.contentType}
        typeLabel={typeLabel}
        size="table"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-v2-fg-tertiary">{typeLabel}</p>
        <p className={cn("text-sm font-semibold whitespace-pre-line text-v2-fg", linkable && "group-hover:underline")}>
          {name}
        </p>
        {periodLabel ? <p className="text-xs text-v2-fg-tertiary tabular-nums">{periodLabel}</p> : null}
      </div>
    </div>
  );

  // The chevron sits in a fixed column at the right edge, so it lines up across rows. Unlinked rows keep the column empty.
  if (!linkable) {
    return (
      <div
        data-futures-content-uid={content.uid}
        className="grid min-h-v2-row-min grid-cols-[minmax(0,1fr)_1rem] items-center gap-2"
      >
        {body}
        <span aria-hidden="true" className="size-4" />
      </div>
    );
  }
  return (
    <Link
      to={view.link}
      state={view.navigationState}
      prefetch="intent"
      data-futures-content-uid={content.uid}
      className={cn(
        "group grid min-h-v2-row-min grid-cols-[minmax(0,1fr)_1rem] items-center gap-2 rounded-md hover:bg-v2-hover",
        v2FocusRing,
      )}
      {...getV2LinkTransitionProps("forward", () => onOpenContent(content.uid))}
    >
      {body}
      <ChevronRightIcon className="size-4 text-v2-fg-tertiary" aria-hidden="true" />
    </Link>
  );
}
