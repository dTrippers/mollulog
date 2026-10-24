import { KeyIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { useId, useState } from "react";
import StudentTierLabel from "~/components/features/students/StudentTierLabel";
import { ProfileImage } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { API_AUDIT_HISTORY_DIRECT_SOURCES } from "~/domain/api-audit-history";
import { getDeveloperScopeSummary, getUserScopeSummary, type ApiScope } from "~/domain/mollulog-api-spec";
import { type Change, getChangedValues } from "~/domain/data-history";
import type { ApiAuditEvent } from "~/models/mollulog-api";

export default function HistoryList({
  events,
  studentsByUid,
  itemNamesByUid,
  apiKeysByUid,
}: {
  events: ApiAuditEvent[];
  studentsByUid: Record<string, string>;
  itemNamesByUid: Record<string, string>;
  apiKeysByUid: Record<string, KeyMetadata>;
}) {
  const displayTimeZone = useDisplayTimeZone();

  return (
    <div className="space-y-5">
      {groupEventsByDate(events, displayTimeZone).map(({ date, events: groupedEvents }) => (
        <section key={date}>
          <h2 className="mb-2 px-1 text-xs font-semibold tabular-nums text-muted-foreground">{date}</h2>
          <ol
            className="rounded-lg bg-card px-4 shadow-sm shadow-black/5 sm:px-5"
            aria-label={`${date} 데이터 변경 이력`}
          >
            {groupedEvents.map((event) => (
              <HistoryEvent
                key={`${event.kind}-${event.id}`}
                event={event}
                timeZone={displayTimeZone}
                studentName={event.studentUid ? (studentsByUid[event.studentUid] ?? null) : null}
                itemNamesByUid={itemNamesByUid}
                apiKeysByUid={apiKeysByUid}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function formatDate(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}/${part("month")}/${part("day")}`;
}

function groupEventsByDate(events: ApiAuditEvent[], timeZone: string) {
  const dates = new Map<string, ApiAuditEvent[]>();
  for (const event of events) {
    const date = formatDate(event.createdAt, timeZone);
    const group = dates.get(date) ?? [];
    group.push(event);
    dates.set(date, group);
  }
  return [...dates].map(([date, groupedEvents]) => ({ date, events: groupedEvents }));
}

type KeyMetadata = {
  scopes: ApiScope[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

function HistoryEvent({
  event,
  timeZone,
  studentName,
  itemNamesByUid,
  apiKeysByUid,
}: {
  event: ApiAuditEvent;
  timeZone: string;
  studentName: string | null;
  itemNamesByUid: Record<string, string>;
  apiKeysByUid: Record<string, KeyMetadata>;
}) {
  const changes = event.kind === "student" ? getChangedValues(event.beforeState, event.afterState) : [];
  const groups = [...new Set(changes.map(({ group }) => group))];
  const recruitmentChange = changes.find(({ key }) => key === "recruited");
  const subject =
    event.kind === "connection"
      ? event.action === "connected"
        ? "연결"
        : event.action === "scopes_expanded"
          ? "권한 추가"
          : event.action === "disconnected"
            ? "연결 해제"
            : "동작을 확인할 수 없어요"
      : event.kind === "key"
      ? event.action === "issued"
        ? "API 키 발급"
        : event.action === "revoked"
          ? "API 키 삭제"
          : "키 정보를 확인할 수 없어요"
      : recruitmentChange
        ? recruitmentChange.after
          ? "모집 등록"
          : "모집 해제"
        : groups.join(" · ");
  const title =
    event.kind === "connection"
      ? (event.oauthApplicationName ?? "애플리케이션 정보를 확인할 수 없어요")
      : event.kind === "key"
        ? (event.apiKeyName ?? "키 이름을 확인할 수 없어요")
        : (studentName ?? "학생 정보를 찾을 수 없어요");
  const time = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(event.createdAt));

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 sm:grid-cols-[3rem_2rem_minmax(0,1fr)_auto] sm:gap-x-4">
      <div className="col-start-2 row-start-1 flex items-start justify-between gap-3 sm:contents">
        <time
          dateTime={event.createdAt}
          className="shrink-0 text-xs tabular-nums text-muted-foreground sm:col-start-1 sm:row-start-1 sm:pt-1"
        >
          {time}
        </time>
        <div className="min-w-0 max-w-40 break-words text-right text-xs text-muted-foreground sm:col-start-4 sm:row-start-1 sm:pt-1">
          <p>{event.kind === "key" ? "API 키 관리" : getHistorySource(event.source)}</p>
          {event.kind === "student" && event.source === "api" ? (
            <p className="mt-0.5 flex items-center justify-end gap-1">
              {event.oauthApplicationUid ? (
                <OAuthApplicationIcon />
              ) : event.apiKeyUid ? (
                <KeyIcon className="size-3.5" aria-hidden="true" />
              ) : null}
              {event.oauthApplicationName ?? event.apiKeyName ?? "주체 정보를 확인할 수 없어요"}
            </p>
          ) : null}
        </div>
      </div>
      <div className="col-start-1 row-start-2 shrink-0 sm:col-start-2 sm:row-start-1">
        {event.kind === "connection" ? (
          <OAuthApplicationIcon />
        ) : event.kind === "key" ? (
          <span className="flex size-8 items-center justify-center rounded-full bg-muted">
            <KeyIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
        ) : (
          <ProfileImage studentUid={event.studentUid && studentName ? event.studentUid : null} imageSize={8} />
        )}
      </div>
      <div className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="break-words text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">{subject}</span>
        </div>
        {event.kind === "connection" ? (
          <ConnectionSummary event={event} timeZone={timeZone} />
        ) : event.kind === "key" ? (
          <KeySummary event={event} metadata={event.apiKeyUid ? apiKeysByUid[event.apiKeyUid] : undefined} timeZone={timeZone} />
        ) : (
          <ChangedValues changes={changes} itemNamesByUid={itemNamesByUid} />
        )}
      </div>
    </li>
  );
}

function getHistorySource(source: string) {
  if (source === "api") return "API";
  if (source === "oauth_connection") return "연결된 애플리케이션";
  if (source === "sync_draft") return "데이터 반영";
  if (source === "recruitment_result") return "모집 결과 기록";
  if ((API_AUDIT_HISTORY_DIRECT_SOURCES as readonly string[]).includes(source)) return "웹에서 수정";
  return "변경 경로를 확인할 수 없어요";
}

function KeySummary({ event, metadata, timeZone }: { event: ApiAuditEvent; metadata?: KeyMetadata; timeZone: string }) {
  const scopes = metadata ? getDeveloperScopeSummary(metadata.scopes) : null;
  return (
    <p className="mt-1 break-words text-sm text-muted-foreground">
      {metadata && scopes && (event.action === "issued" || event.action === "revoked")
        ? `${scopes} · ${event.action === "issued" ? `${formatDate(metadata.expiresAt, timeZone)} 만료` : `${formatDate(metadata.createdAt, timeZone)} 발급`}`
        : "키 정보를 확인할 수 없어요"}
    </p>
  );
}

function ConnectionSummary({ event, timeZone }: { event: ApiAuditEvent; timeZone: string }) {
  const scopes = event.scopes ? getUserScopeSummary(event.scopes) : null;
  return (
    <p className="mt-1 break-words text-sm text-muted-foreground">
      {scopes || "권한 정보를 확인할 수 없어요"}
      {event.action === "disconnected" && event.grantCreatedAt ? ` · ${formatDate(event.grantCreatedAt, timeZone)} 연결` : null}
      {event.disconnectReason === "application_deleted" ? (
        <span className="text-muted-foreground"> · 앱 삭제로 해제</span>
      ) : null}
    </p>
  );
}

function OAuthApplicationIcon() {
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
      <Squares2X2Icon className="size-4 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

function ChangedValues({ changes, itemNamesByUid }: { changes: Change[]; itemNamesByUid: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  if (changes.length === 0) return <p className="mt-1 text-sm text-muted-foreground">변경 내용을 표시할 수 없어요.</p>;
  const multipleGroups = new Set(changes.map(({ group }) => group)).size > 1;
  return (
    <div className="mt-1">
      <p className="break-words text-sm leading-6">
        {changes.slice(0, 2).map((change, index) => (
          <span key={change.key}>
            {index > 0 ? <span className="mx-1.5 text-muted-foreground">·</span> : null}
            <span className="text-muted-foreground">
              {multipleGroups ? `${change.group} · ` : ""}
              {changeLabel(change, itemNamesByUid)}{" "}
            </span>
            <span className="text-muted-foreground">
              <span className="sr-only">이전 값: </span>
              {renderAuditValue(change.key, change.before)}
            </span>
            <span className="text-muted-foreground"> → </span>
            <span className="font-medium">
              <span className="sr-only">변경 후 값: </span>
              {renderAuditValue(change.key, change.after)}
            </span>
          </span>
        ))}
      </p>
      {changes.length > 2 ? (
        <>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}
            className="mt-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {expanded ? "접기" : `변경 ${changes.length}개 보기`}
          </button>
          {expanded ? (
            <div id={detailsId} className="mt-3 rounded-md bg-muted/50 p-3">
              <table className="w-full table-fixed text-left text-xs sm:text-sm">
                <caption className="sr-only">전체 변경 내용</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-1/2 pb-2 pr-3 font-medium">
                      항목
                    </th>
                    <th scope="col" className="pb-2 pr-2 font-medium">
                      이전
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      변경 후
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.key}>
                      <th scope="row" className="break-words py-1 pr-3 align-top font-normal">
                        {multipleGroups ? (
                          <span className="block text-xs text-muted-foreground">{change.group}</span>
                        ) : null}
                        {changeLabel(change, itemNamesByUid)}
                      </th>
                      <td className="break-words py-1 pr-2 align-top text-muted-foreground">
                        {renderAuditValue(change.key, change.before)}
                      </td>
                      <td className="break-words py-1 align-top font-medium">
                        {renderAuditValue(change.key, change.after)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function changeLabel(change: Change, itemNamesByUid: Record<string, string>) {
  return change.key.startsWith("gift:") ? (itemNamesByUid[change.label] ?? "선물 정보를 찾을 수 없어요") : change.label;
}

function renderAuditValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined) return "미입력";
  if (key === "recruited" && typeof value === "boolean") return value ? "모집" : "미모집";
  if ((key === "tier" || key === "targetTier") && typeof value === "number") {
    return <StudentTierLabel tier={Math.min(value, 5)} />;
  }
  if ((key === "weaponTier" || key === "targetWeaponTier") && typeof value === "number") {
    return value === 0 ? "미장착" : <StudentTierLabel tier={5 + value} />;
  }
  if (typeof value !== "number" && typeof value !== "string") return "변경 값을 표시할 수 없어요";
  return key.startsWith("gift:") ? `${value}개` : String(value);
}
