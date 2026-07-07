import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Form, Link } from "react-router";
import ContentCommentView from "~/components/features/contents/ContentCommentView";
import { StudentCards } from "~/components/features/students";
import { Button } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, type UtcIsoString } from "~/lib/date-time";
import { pickupGroupTypeLocale } from "~/locales/ko";

type PickupHistoryViewProps = {
  uid: string;
  event: {
    events: { uid: string; name: string }[];
    type: string;
    since: UtcIsoString;
  };
  recruitedStudents: {
    uid: string;
    name: string;
    pickup: boolean;
    tier: number;
  }[];
  exchangedStudents: {
    uid: string;
    name: string;
    pickup: boolean;
    tier: number;
  }[];
  stats: {
    totalTrial: number | null;
    tier3Count: number;
    pickupCount: number;
  };
  trial?: number | null;
  trialMissing?: boolean;
  comment?: {
    uid: string;
    body: string;
    createdAt: UtcIsoString;
    sensei: {
      username: string;
      profileStudentId: string | null;
    };
  } | null;
  editable?: boolean;
};

function formatPercentage(ratio: number) {
  if (!Number.isFinite(ratio)) {
    return "0.00 %";
  }
  return `${(ratio * 100).toFixed(2)} %`;
}

export default function PickupHistoryView({
  uid,
  event,
  recruitedStudents,
  exchangedStudents,
  stats,
  trial,
  trialMissing,
  comment,
  editable,
}: PickupHistoryViewProps) {
  const tier3Students = recruitedStudents.filter(({ tier }) => tier === 3);
  const tier3ExchangedStudents = exchangedStudents.filter(({ tier }) => tier === 3);
  const tier3StudentListMissing = stats.tier3Count > 0 && tier3Students.length === 0;
  const visibleComment = comment?.body.trim() ? comment : null;

  return (
    <article className="my-4 rounded-lg bg-neutral-100 p-5 dark:bg-neutral-900">
      <div className="flex flex-col gap-5 md:flex-row md:gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <PickupHeader event={event} />
          {tier3Students.length > 0 && <Tier3StudentList students={tier3Students} />}
          {tier3StudentListMissing && <Tier3StudentListMissing />}
          {tier3ExchangedStudents.length > 0 && <ExchangedStudentList students={tier3ExchangedStudents} />}
          {visibleComment && <PickupComment comment={visibleComment} />}
        </div>

        <aside className="flex flex-col gap-3 md:w-60">
          <PickupStats
            totalTrial={stats.totalTrial}
            tier3Count={stats.tier3Count}
            pickupCount={stats.pickupCount}
            trialMissing={trialMissing ?? trial == null}
          />
          {editable && <PickupActions uid={uid} />}
        </aside>
      </div>
    </article>
  );
}

function PickupComment({ comment }: { comment: NonNullable<PickupHistoryViewProps["comment"]> }) {
  return (
    <div className="mt-2">
      <ContentCommentView
        comments={[
          {
            uid: comment.uid,
            body: comment.body,
            visibility: "public",
            pinned: true,
            createdAt: comment.createdAt,
            sensei: comment.sensei,
          },
        ]}
      />
    </div>
  );
}

function PickupHeader({ event }: { event: PickupHistoryViewProps["event"] }) {
  const displayTimeZone = useDisplayTimeZone();

  return (
    <div>
      <h2 className="whitespace-pre-line font-bold text-base leading-tight md:text-lg">
        {event.events.map((eventItem, index) => (
          <span key={eventItem.uid}>
            {index > 0 && " / "}
            <Link to={`/events/${eventItem.uid}`} className="hover:underline">
              {eventItem.name}
            </Link>
          </span>
        ))}
        <ChevronRightIcon className="ml-1 inline-block size-4 align-[-0.125em]" />
      </h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {pickupGroupTypeLocale[event.type] ?? "픽업 모집"} |{" "}
        {formatInstant(event.since, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })}
      </p>
    </div>
  );
}

function Tier3StudentList({ students }: { students: PickupHistoryViewProps["recruitedStudents"] }) {
  const cardStudents = students.map(({ uid, name, pickup }) => ({
    uid,
    name,
    label: pickup ? <span className="text-yellow-500">픽업</span> : undefined,
  }));

  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">모집한 ★3 학생</p>
      <StudentCards layout="wrap" cardSize="md" gap="tight" namePlacement="overlay" students={cardStudents} />
    </div>
  );
}

function Tier3StudentListMissing() {
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">모집한 ★3 학생</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">학생 목록 미입력</p>
    </div>
  );
}

function ExchangedStudentList({ students }: { students: PickupHistoryViewProps["exchangedStudents"] }) {
  const cardStudents = students.map(({ uid, name }) => ({
    uid,
    name,
    label: <span className="text-yellow-500">교환</span>,
  }));

  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">모집 포인트 교환 학생</p>
      <StudentCards layout="wrap" cardSize="md" gap="tight" namePlacement="overlay" students={cardStudents} />
    </div>
  );
}

type PickupStatsProps = {
  totalTrial: number | null;
  tier3Count: number;
  pickupCount: number;
  trialMissing: boolean;
};

function PickupStats({ totalTrial, tier3Count, pickupCount, trialMissing }: PickupStatsProps) {
  const hasTrial = !trialMissing && totalTrial !== null;
  const statsGridClassName = hasTrial ? "grid-cols-3 divide-x md:divide-y" : "grid-cols-1";
  const stats = [
    <PickupStat key="total" label="총 모집 횟수" value={totalTrial === null ? "미입력" : `${totalTrial}회`} />,
  ];

  if (hasTrial) {
    stats.push(
      <PickupStat
        key="tier3"
        label="★3 학생"
        value={`${tier3Count}회`}
        detail={formatPercentage(tier3Count / totalTrial)}
      />,
      <PickupStat
        key="pickup"
        label="픽업 학생"
        value={`${pickupCount}회`}
        detail={formatPercentage(pickupCount / totalTrial)}
      />,
    );
  }

  return (
    <>
      {trialMissing && (
        <div className="inline-flex w-fit items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          모집 횟수 미입력
        </div>
      )}
      <div
        className={`grid ${statsGridClassName} divide-neutral-200 overflow-hidden rounded-md border border-neutral-200/80 bg-white/70 dark:divide-neutral-700 dark:border-neutral-700/80 dark:bg-neutral-950/40 md:block md:divide-x-0`}
      >
        {stats}
      </div>
    </>
  );
}

function PickupStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <p className="font-bold text-neutral-950 dark:text-neutral-50">{value}</p>
        {detail && <p className="text-xs text-neutral-500 dark:text-neutral-400">({detail})</p>}
      </div>
    </div>
  );
}

function PickupActions({ uid }: { uid: string }) {
  const handleDeleteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm("정말로 이 모집 이력을 삭제할까요?")) {
      event.preventDefault();
    }
  };

  return (
    <div className="flex flex-wrap justify-end gap-2 md:mt-auto">
      <Button text="편집" to={`/my?path=pickups/edit/${uid}`} size="xs" variant="tint" />
      <Form method="delete" action="?index" onSubmit={handleDeleteSubmit}>
        <input type="hidden" name="uid" value={uid} />
        <Button text="삭제" type="submit" size="xs" variant="tint-red" />
      </Form>
    </div>
  );
}
