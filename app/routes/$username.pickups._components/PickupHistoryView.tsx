import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { ContentMedia } from "~/components/v2/features/futures/ContentMedia";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import PickupStudentList from "./PickupStudentList";
import { DELETE_FAILED, formatCount, formatRate, getPickupTypeLabel, type PickupStudent } from "./pickup-record";

export type PickupHistoryViewProps = {
  username: string;
  uid: string;
  event: {
    events: { uid: string; name: string }[];
    // The game content whose logo is the event image; null when the record has no content.
    logoContentUid: string | null;
    type: string;
    since: UtcIsoString;
  };
  recruitedStudents: PickupStudent[];
  exchangedStudents: PickupStudent[];
  stats: {
    totalTrial: number | null;
    tier3Count: number;
    pickupCount: number;
  };
  comment?: { body: string } | null;
  editable?: boolean;
};

export default function PickupHistoryView({
  username,
  uid,
  event,
  recruitedStudents,
  exchangedStudents,
  stats,
  comment,
  editable,
}: PickupHistoryViewProps) {
  const tier3Students = recruitedStudents.filter(({ tier }) => tier === 3);
  const tier3ExchangedStudents = exchangedStudents.filter(({ tier }) => tier === 3);
  // The ★3 count is known but no student was recorded, so the list says it was not entered.
  const tier3StudentListMissing = stats.tier3Count > 0 && tier3Students.length === 0;
  const opinion = comment?.body.trim() ? comment.body : null;
  const typeLabel = getPickupTypeLabel(event.type);

  return (
    <article className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="grid gap-v2-block-gap md:grid-cols-[minmax(0,1fr)_15rem] md:gap-x-v2-column-gap">
        <PickupHeader event={event} typeLabel={typeLabel} />
        <div className="md:col-start-2 md:row-span-2 md:row-start-1">
          <PickupStatBlock stats={stats} />
        </div>
        <div className="flex min-w-0 flex-col gap-v2-group-gap md:col-start-1">
          {tier3Students.length > 0 || tier3StudentListMissing ? (
            <PickupStudentList
              title="모집한 ★3 학생"
              students={tier3Students}
              labelFor={({ pickup }) => (pickup ? "픽업" : undefined)}
              emptyText="학생 목록 미입력"
            />
          ) : null}
          {tier3ExchangedStudents.length > 0 ? (
            <PickupStudentList
              title="모집 포인트 교환 학생"
              students={tier3ExchangedStudents}
              labelFor={() => "교환"}
            />
          ) : null}
          {opinion ? (
            <p className="rounded-md bg-v2-inset px-3 py-2 text-sm whitespace-pre-line text-v2-fg-secondary">
              {opinion}
            </p>
          ) : null}
        </div>
      </div>
      {editable ? <PickupActions username={username} uid={uid} /> : null}
    </article>
  );
}

function PickupHeader({ event, typeLabel }: { event: PickupHistoryViewProps["event"]; typeLabel: string }) {
  const displayTimeZone = useDisplayTimeZone();
  const logoContentUid = event.logoContentUid;

  return (
    <div className="flex min-w-0 items-center gap-v2-media-gap md:col-start-1">
      <ContentMedia
        source={logoContentUid ? { kind: "logo", contentUid: logoContentUid } : { kind: "type" }}
        contentType="pickup"
        typeLabel={typeLabel}
        size="timeline"
      />
      <div className="min-w-0">
        {/* Event names keep the line breaks of the game data, one event per line. */}
        <h3 className="text-base leading-snug font-semibold text-v2-fg">
          {event.events.map((eventItem) => (
            <Link
              key={eventItem.uid}
              to={`/events/${eventItem.uid}`}
              className="block whitespace-pre-line hover:underline"
            >
              {eventItem.name}
            </Link>
          ))}
        </h3>
        <p className="mt-0.5 text-xs text-v2-fg-tertiary tabular-nums">
          {typeLabel} · {formatInstant(event.since, { timeZone: displayTimeZone, format: "YYYY/MM/DD" })}
        </p>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  rate,
  className,
}: {
  label: string;
  value: string;
  rate?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-3 py-2", className)}>
      <p className="text-xs text-v2-fg-tertiary">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
        <span className="text-base font-bold text-v2-fg md:text-lg">{value}</span>
        {rate ? <span className="text-xs text-v2-fg-tertiary">{rate}</span> : null}
      </p>
    </div>
  );
}

// Desktop stacks the figures in a right column. Mobile puts them in one row. A record without a trial count shows
// that count as "미입력" and leaves the ★3 figures out, since they have nothing to be compared with.
function PickupStatBlock({ stats }: { stats: PickupHistoryViewProps["stats"] }) {
  const { totalTrial } = stats;
  if (totalTrial === null) {
    return (
      <div className="overflow-hidden rounded-md bg-v2-inset">
        <StatCell label="총 모집 횟수" value="미입력" />
      </div>
    );
  }
  // A trial count of 0 has no ratio to show.
  const hasRate = totalTrial > 0;
  return (
    <div className="grid grid-cols-3 divide-x divide-v2-divider overflow-hidden rounded-md bg-v2-inset md:grid-cols-1 md:divide-x-0 md:divide-y">
      <StatCell label="총 모집 횟수" value={`${formatCount(totalTrial)}회`} />
      <StatCell
        label="★3 학생"
        value={`${formatCount(stats.tier3Count)}회`}
        rate={hasRate ? formatRate(stats.tier3Count, totalTrial) : undefined}
      />
      <StatCell
        label="픽업 학생"
        value={`${formatCount(stats.pickupCount)}회`}
        rate={hasRate ? formatRate(stats.pickupCount, totalTrial) : undefined}
      />
    </div>
  );
}

function PickupActions({ username, uid }: { username: string; uid: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleting = fetcher.state !== "idle";
  const deleteFailed = fetcher.state === "idle" && fetcher.data?.error === DELETE_FAILED;

  const handleDelete = () => {
    setConfirmOpen(false);
    fetcher.submit({ uid }, { method: "delete", action: "?index" });
  };

  return (
    <div className="mt-v2-group-gap flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-v2-divider pt-v2-block-gap">
      {deleteFailed ? (
        <StatusNotice tone="danger" className="mr-auto">
          모집 기록을 삭제하지 못했어요. 다시 시도해주세요.
        </StatusNotice>
      ) : null}
      <Link
        to={`/@${username}/pickups/edit/${uid}`}
        className={v2ButtonClassName({ variant: "secondary", size: "sm", className: "min-w-14" })}
      >
        편집
      </Link>
      <Button
        variant="danger-subtle"
        size="sm"
        className="min-w-14"
        disabled={deleting}
        onClick={() => setConfirmOpen(true)}
      >
        삭제
      </Button>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="정말로 이 모집 기록을 삭제할까요?"
        size="sm"
      >
        <p className="text-sm text-v2-fg-secondary">
          남긴 의견도 함께 삭제돼요. 모집한 학생에 추가된 학생은 그대로 남아요.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmOpen(false)}>취소</Button>
          <Button variant="danger" onClick={handleDelete}>
            삭제
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
