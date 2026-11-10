import { KeyIcon, Squares2X2Icon } from "@heroicons/react/16/solid";
import { useId, useState } from "react";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { API_AUDIT_HISTORY_DIRECT_SOURCES } from "~/domain/api-audit-history";
import { type Change, getChangedValues } from "~/domain/data-history";
import { type ApiScope, getDeveloperScopeSummary, getUserScopeSummary } from "~/domain/mollulog-api-spec";
import { cn } from "~/lib/utils";
import type { ApiAuditEvent } from "~/models/mollulog-api";
import { TierFace } from "../connect._components/TierFace";

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
    <div className="flex flex-col gap-v2-block-gap">
      {groupEventsByDate(events, displayTimeZone).map(({ date, events: groupedEvents }) => (
        <section key={date} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold tabular-nums text-v2-fg-secondary">{date}</h2>
          <ol className="rounded-lg bg-v2-surface py-0.5" aria-label={`${date} 데이터 변경 이력`}>
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
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[2.5rem_2rem_minmax(0,1fr)_auto]">
      <div className="col-start-2 row-start-1 flex items-start justify-between gap-3 sm:contents">
        <time
          dateTime={event.createdAt}
          className="shrink-0 text-xs tabular-nums text-v2-fg-tertiary sm:col-start-1 sm:row-start-1 sm:pt-1.5"
        >
          {time}
        </time>
        <div className="flex min-w-0 max-w-40 flex-col items-end gap-1 text-right sm:col-start-4 sm:row-start-1">
          <span className="rounded-md bg-v2-inset px-2 py-0.5 text-xs text-v2-fg-secondary">
            {event.kind === "key" ? "API 키 관리" : getHistorySource(event.source)}
          </span>
          {event.kind === "student" && event.source === "api" ? (
            <p className="flex min-w-0 items-center justify-end gap-1 break-words text-xs text-v2-fg-tertiary">
              {event.oauthApplicationUid ? (
                <Squares2X2Icon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : event.apiKeyUid ? (
                <KeyIcon className="size-3.5 shrink-0" aria-hidden="true" />
              ) : null}
              {event.oauthApplicationName ?? event.apiKeyName ?? "주체 정보를 확인할 수 없어요"}
            </p>
          ) : null}
        </div>
      </div>
      <div className="col-start-1 row-start-2 shrink-0 sm:col-start-2 sm:row-start-1">
        {event.kind === "connection" ? (
          <SubjectIcon Icon={Squares2X2Icon} />
        ) : event.kind === "key" ? (
          <SubjectIcon Icon={KeyIcon} />
        ) : (
          <StudentThumb
            studentUid={event.studentUid && studentName ? event.studentUid : null}
            name={studentName ?? ""}
            variant={null}
            small
            showCaption={false}
            showRecruitmentLabel={false}
          />
        )}
      </div>
      <div className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="break-words text-sm font-semibold text-v2-fg">{title}</h3>
          <span className="text-xs text-v2-fg-tertiary">{subject}</span>
        </div>
        {event.kind === "connection" ? (
          <ConnectionSummary event={event} timeZone={timeZone} />
        ) : event.kind === "key" ? (
          <KeySummary
            event={event}
            metadata={event.apiKeyUid ? apiKeysByUid[event.apiKeyUid] : undefined}
            timeZone={timeZone}
          />
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
    <p className="mt-1 break-words text-sm text-v2-fg-secondary">
      {metadata && scopes && (event.action === "issued" || event.action === "revoked")
        ? `${scopes} · ${event.action === "issued" ? `${formatDate(metadata.expiresAt, timeZone)} 만료` : `${formatDate(metadata.createdAt, timeZone)} 발급`}`
        : "키 정보를 확인할 수 없어요"}
    </p>
  );
}

function ConnectionSummary({ event, timeZone }: { event: ApiAuditEvent; timeZone: string }) {
  const scopes = event.scopes ? getUserScopeSummary(event.scopes) : null;
  return (
    <p className="mt-1 break-words text-sm text-v2-fg-secondary">
      {scopes || "권한 정보를 확인할 수 없어요"}
      {event.action === "disconnected" && event.grantCreatedAt
        ? ` · ${formatDate(event.grantCreatedAt, timeZone)} 연결`
        : null}
      {event.disconnectReason === "application_deleted" ? " · 앱 삭제로 해제" : null}
    </p>
  );
}

function SubjectIcon({ Icon }: { Icon: React.ElementType }) {
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-v2-inset">
      <Icon className="size-4 text-v2-fg-secondary" aria-hidden="true" />
    </span>
  );
}

function ChangedValues({ changes, itemNamesByUid }: { changes: Change[]; itemNamesByUid: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  if (changes.length === 0) return <p className="mt-1 text-sm text-v2-fg-secondary">변경 내용을 표시할 수 없어요.</p>;
  const multipleGroups = new Set(changes.map(({ group }) => group)).size > 1;
  return (
    <div className="mt-1">
      <p className="break-words text-sm leading-6">
        {changes.slice(0, 2).map((change, index) => (
          <span key={change.key}>
            {index > 0 ? <span className="mx-1.5 text-v2-fg-tertiary">·</span> : null}
            <span className="text-v2-fg-secondary">
              {multipleGroups ? `${change.group} · ` : ""}
              {changeLabel(change, itemNamesByUid)}{" "}
            </span>
            <span className="text-v2-fg-secondary">
              <span className="sr-only">이전 값: </span>
              {renderAuditValue(change.key, change.before)}
            </span>
            <span className="text-v2-fg-tertiary"> → </span>
            <span className="font-semibold text-v2-fg">
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
            className={cn(
              "mt-1 cursor-pointer rounded-sm text-xs text-v2-fg-secondary underline hover:text-v2-fg",
              v2FocusRing,
            )}
          >
            {expanded ? "접기" : `변경 ${changes.length}개 보기`}
          </button>
          {expanded ? (
            <div id={detailsId} className="mt-2 rounded-md bg-v2-inset p-3">
              <table className="w-full table-fixed text-left text-xs sm:text-sm">
                <caption className="sr-only">전체 변경 내용</caption>
                <thead className="text-xs text-v2-fg-tertiary">
                  <tr>
                    <th scope="col" className="w-1/2 pb-2 pr-3 font-normal">
                      항목
                    </th>
                    <th scope="col" className="pb-2 pr-2 font-normal">
                      이전
                    </th>
                    <th scope="col" className="pb-2 font-normal">
                      변경 후
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.key}>
                      <th scope="row" className="break-words py-1 pr-3 align-top font-normal text-v2-fg">
                        {multipleGroups ? (
                          <span className="block text-xs text-v2-fg-tertiary">{change.group}</span>
                        ) : null}
                        {changeLabel(change, itemNamesByUid)}
                      </th>
                      <td className="break-words py-1 pr-2 align-top text-v2-fg-secondary">
                        {renderAuditValue(change.key, change.before)}
                      </td>
                      <td className="break-words py-1 align-top font-semibold text-v2-fg">
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
    return <TierFace tier={Math.min(value, 5)} />;
  }
  if ((key === "weaponTier" || key === "targetWeaponTier") && typeof value === "number") {
    return value === 0 ? "미장착" : <TierFace tier={5 + value} />;
  }
  if (typeof value !== "number" && typeof value !== "string") return "변경 값을 표시할 수 없어요";
  return key.startsWith("gift:") ? `${value}개` : String(value);
}
