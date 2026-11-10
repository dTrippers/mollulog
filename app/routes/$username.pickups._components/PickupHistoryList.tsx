import { PlusIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { compareInstantDesc, type UtcIsoString } from "~/lib/date-time";
import PickupHistoryView, { type PickupHistoryViewProps } from "./PickupHistoryView";
import { formatCount } from "./pickup-record";

const PAGE_SIZE = 10;

type History = Omit<PickupHistoryViewProps, "username" | "editable"> & { trial?: number | null };

type PickupHistoryListProps = {
  username: string;
  histories: History[];
  // Records whose linked students or event failed to load. Each takes its own place in the list.
  unavailableRecords: { uid: string; since: UtcIsoString }[];
  editable: boolean;
};

type Entry =
  | { kind: "record"; since: UtcIsoString; history: History }
  | { kind: "unavailable"; since: UtcIsoString; uid: string };

export default function PickupHistoryList({
  username,
  histories,
  unavailableRecords,
  editable,
}: PickupHistoryListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const entries: Entry[] = [
    ...histories.map((history): Entry => ({ kind: "record", since: history.event.since, history })),
    ...unavailableRecords.map((record): Entry => ({ kind: "unavailable", ...record })),
  ].sort((a, b) => compareInstantDesc(a.since, b.since));
  const visible = entries.slice(0, visibleCount);

  return (
    <section aria-labelledby="pickup-records-title">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="pickup-records-title" className="text-base leading-[1.4] font-semibold text-v2-fg">
          모집 기록 <span className="font-normal text-v2-fg-tertiary tabular-nums">{formatCount(entries.length)}</span>
        </h2>
        {editable ? (
          <Link to={`/@${username}/pickups/edit/new`} className={v2ButtonClassName({ variant: "primary" })}>
            <PlusIcon className="size-4" aria-hidden="true" />
            모집 기록 추가
          </Link>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <div className="rounded-lg bg-v2-surface px-v2-block-p py-10 text-center">
          <p className="text-base font-semibold text-v2-fg">아직 모집 기록이 없어요</p>
          {editable ? (
            <p className="mt-1 text-sm text-v2-fg-tertiary">
              모집 결과를 남기면 모집 통계가 계산되고, 얻은 학생이 모집한 학생에 추가돼요.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-v2-block-gap">
            {visible.map((entry) => (
              <li key={entry.kind === "record" ? entry.history.uid : entry.uid}>
                {entry.kind === "record" ? (
                  <PickupHistoryView {...entry.history} username={username} editable={editable} />
                ) : (
                  <UnavailableRecord />
                )}
              </li>
            ))}
          </ul>
          {entries.length > visibleCount ? (
            <div className="mt-v2-block-gap flex justify-center">
              <Button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>더 보기</Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function UnavailableRecord() {
  const revalidator = useRevalidator();
  return (
    <div role="alert" className="rounded-lg bg-v2-surface px-v2-block-p py-8 text-center">
      <p className="text-base font-semibold text-v2-fg">이 모집 기록을 불러오지 못했어요</p>
      <p className="mt-1 text-sm text-v2-fg-tertiary">잠시 후 다시 시도해주세요.</p>
      <Button className="mt-3" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>
        다시 시도
      </Button>
    </div>
  );
}
