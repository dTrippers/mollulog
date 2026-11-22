import { CheckIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { RankStatusPill } from "~/components/v2/features/raid-records/RaidRecordBits";
import {
  formatRaidRank,
  formatRaidScore,
  RAID_RECORD_SERVER_LABEL,
  RAID_RECORD_SERVER_SHORT_LABEL,
} from "~/components/v2/features/raid-records/raid-record-format";
import { RAID_RECORD_SERVERS, type RaidRecordServer } from "~/domain/raid-record";
import { defenseTypeLocale } from "~/locales/ko";
import type { RaidChartRecordView } from "~/views/raid-records";
import type { RaidChartMyScoreMode, RaidChartSaveStatus } from "./use-raid-chart-my-score";

// "한국 | 일본" before "내 점수", shown only when the Sensei has a record of the matching Japanese season.
export function RaidChartServerChoice({
  value,
  onChange,
}: {
  value: RaidRecordServer;
  onChange: (server: RaidRecordServer) => void;
}) {
  return (
    <fieldset className="inline-flex overflow-hidden rounded-md border border-neutral-300 text-xs dark:border-neutral-600">
      <legend className="sr-only">기록 서버</legend>
      {RAID_RECORD_SERVERS.map((server) => (
        <button
          key={server}
          type="button"
          aria-pressed={server === value}
          onClick={() => onChange(server)}
          className={
            server === value
              ? "cursor-pointer bg-neutral-900 px-2 py-1 font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "cursor-pointer px-2 py-1 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }
        >
          {RAID_RECORD_SERVER_SHORT_LABEL[server]}
        </button>
      ))}
    </fieldset>
  );
}

const linkClassName = "font-medium text-blue-600 underline underline-offset-2 dark:text-blue-400";

// The line under "내 점수": the record the score is saved to, a save failure, or why the score stays in the browser.
export function RaidChartRecordLine({
  mode,
  server,
  seasonIndex,
  showSeasonIndex,
  raidType,
  defenseType,
  record,
  savedScore,
  inputEmpty,
  status,
  onRetry,
  username,
}: {
  mode: RaidChartMyScoreMode;
  server: RaidRecordServer;
  seasonIndex: number | null;
  // With the server choice on screen, the line names the season, since the two servers number it differently.
  showSeasonIndex: boolean;
  raidType: string | null;
  defenseType: string;
  record: RaidChartRecordView | null;
  savedScore: number | null;
  inputEmpty: boolean;
  status: RaidChartSaveStatus;
  onRetry: () => void;
  username: string | null;
}) {
  const lineClassName =
    "flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-right text-xs break-keep text-neutral-600 dark:text-neutral-300";

  if (mode === "unstarted") {
    return <p className={lineClassName}>한국 서버에서 아직 시작하지 않은 시즌이라 이 브라우저에만 저장해요.</p>;
  }
  if (mode !== "record") return null;
  if (status.kind === "failed") {
    return (
      <p role="alert" className={`${lineClassName} font-medium text-red-600 dark:text-red-400`}>
        <span>{status.message}</span>
        {status.retryable ? (
          <button type="button" onClick={onRetry} className={`cursor-pointer ${linkClassName}`}>
            다시 시도
          </button>
        ) : null}
      </p>
    );
  }
  if (!record || !username) return null;

  const parts = ["내 기록", `${RAID_RECORD_SERVER_LABEL[server]}${showSeasonIndex && seasonIndex !== null ? ` #${seasonIndex}` : ""}`];
  if (raidType === "elimination") {
    parts.push(defenseTypeLocale[defenseType as keyof typeof defenseTypeLocale] ?? defenseType);
    parts.push(`합산 ${formatRaidScore(record.totalScore)}`);
  } else if (inputEmpty && savedScore !== null) {
    // The input was emptied, but the record keeps its score.
    parts.push(formatRaidScore(savedScore));
  }
  if (record.rank !== null) parts.push(formatRaidRank(record.rank));

  return (
    <p className={lineClassName}>
      <span>{parts.join(" · ")}</span>
      <RankStatusPill status={record.rankStatus} />
      {record.rank !== null ? (
        <Link to={`/@${username}/raids/${record.uid}`} className={linkClassName}>
          기록 보기
        </Link>
      ) : (
        <Link to={`/@${username}/raids/${record.uid}/edit`} className={linkClassName}>
          순위·편성 입력하기
        </Link>
      )}
    </p>
  );
}

export function RaidChartSaveToast({ visible }: { visible: boolean }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none">
      {visible ? (
        <div className="fixed bottom-[var(--mobile-bottom-offset)] left-1/2 z-layer-toast inline-flex -translate-x-1/2 items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium whitespace-nowrap text-white shadow-lg lg:bottom-6 dark:bg-neutral-100 dark:text-neutral-900">
          <CheckIcon className="size-4" aria-hidden="true" />
          내 기록에 점수를 저장했어요
        </div>
      ) : null}
    </div>
  );
}
