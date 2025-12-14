import dayjs from "dayjs";
import { KeyValueTable, SubTitle } from "~/components/atoms/typography";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ActionCard, type ActionCardAction } from "~/components/molecules/editor";
import { StudentCards } from "~/components/students";
import type { EventTypeEnum } from "~/graphql/graphql";
import { eventTypeLocale } from "~/locales/ko";
import { Link } from "react-router";

type PickupHistoryViewProps = {
  uid: string;
  event: {
    uid: string;
    name: string;
    type: EventTypeEnum;
    since: Date;
  };
  tier3Students: {
    uid: string;
    name: string;
  }[];
  pickupStudentUids: string[];
  trial?: number;
  editable?: boolean;
};

function formatPercentage(ratio: number) {
  return `${(ratio * 100).toFixed(2)} %`;
}

export default function PickupHistoryView({ uid, event, tier3Students, pickupStudentUids, trial, editable }: PickupHistoryViewProps) {
  const actions: ActionCardAction[] = [];
  if (editable) {
    actions.push({ text: "편집", color: "default", link: `/my?path=pickups/edit/${uid}` });
    actions.push({ text: "삭제", color: "red", form: { method: "delete", hiddenInputs: [{ name: "uid", value: uid }] }, danger: true });
  }

  const tier3StudentUids = tier3Students.map(({ uid }) => uid);
  const pickupCounts = pickupStudentUids.filter((uid) => tier3StudentUids.includes(uid)).length;
  const keyValueItems = [];
  if (trial !== undefined) {
    keyValueItems.push({ key: "모집 횟수", value: `${trial} 회` });
    keyValueItems.push({ key: "★3 학생 수", value: `${tier3Students.length} 회 (${formatPercentage(tier3StudentUids.length / trial)})` });
    keyValueItems.push({ key: "픽업 학생 수", value: `${pickupCounts} 회 (${formatPercentage(pickupCounts / trial)})` });
  }

  return (
    <ActionCard actions={actions}>
      <Link to={`/events/${event.uid}`} className="-my-4 flex items-center hover:underline">
        <SubTitle text={event.name} />
        <ChevronRightIcon className="size-4" />
      </Link>
      <p className="text-neutral-500 text-sm">
        {eventTypeLocale[event.type]} | {dayjs(event.since).format("YYYY-MM-DD")}
      </p>

      {tier3StudentUids.length > 0 && (
        <>
          <p className="mt-4 mb-2 font-bold">모집한 ★3 학생</p>
          <StudentCards
            pcGrid={10}
            students={tier3Students.map(({ uid, name }) => ({
              uid,
              name,
              label: pickupStudentUids.includes(uid) ? <span className="text-yellow-500">픽업</span> : undefined,
            }))}
          />
        </>
      )}

      <div className="mt-4">
        {keyValueItems.length > 0 && <KeyValueTable keyPrefix={`pickup-stats-${event.uid}`} items={keyValueItems} />}
      </div>
    </ActionCard>
  );
}
