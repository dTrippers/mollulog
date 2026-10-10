import { ClockIcon, ExclamationCircleIcon, KeyIcon } from "@heroicons/react/24/outline";
import { useMemo } from "react";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import StudentTierLabel from "~/components/features/students/StudentTierLabel";
import { Button, EmptyView, FilterButtons, ProfileImage, SectionCard, SubTitle } from "~/components/primitives";
import {
  API_AUDIT_HISTORY_DIRECT_SOURCES,
  API_AUDIT_HISTORY_FILTERS,
  type ApiAuditHistoryFilter,
} from "~/domain/api-audit-history";
import type { ApiAuditEvent } from "~/models/mollulog-api";
import { getDevelopersHistoryView } from "~/views/developers-history.server";
import { DeveloperPage } from "./developers._components/DeveloperPage";

export const meta: MetaFunction = () => [{ title: "변경 기록 | 몰루로그" }];

const privateHeaders = { "Cache-Control": "private, no-store" };
export const headers: HeadersFunction = ({ parentHeaders }) => {
  const responseHeaders = new Headers(parentHeaders);
  responseHeaders.set("Cache-Control", privateHeaders["Cache-Control"]);
  return responseHeaders;
};

const filterLabels: Record<ApiAuditHistoryFilter, string> = {
  all: "전체",
  direct: "직접 수정",
  data: "데이터 반영",
  recruitment: "모집 결과 기록",
  api: "API",
};
const historyFilters = API_AUDIT_HISTORY_FILTERS;
const directHistorySources: readonly string[] = API_AUDIT_HISTORY_DIRECT_SOURCES;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized", { headers: privateHeaders });

  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get("filter");
  const filter = historyFilters.includes(requestedFilter as ApiAuditHistoryFilter)
    ? (requestedFilter as ApiAuditHistoryFilter)
    : "all";
  try {
    const history = await getDevelopersHistoryView(env, sensei.id, {
      cursor: url.searchParams.get("cursor"),
      filter,
      ctx,
    });
    return data({ ...history, loadError: false }, { headers: privateHeaders });
  } catch (error) {
    console.error("[developers/history] failed to load personal API history", error);
    return data(
      {
        events: [] as ApiAuditEvent[],
        nextCursor: null,
        filter,
        studentsByUid: {} as Record<string, string>,
        itemNamesByUid: {} as Record<string, string>,
        apiKeysByUid: {} as Record<
          string,
          { readScope: boolean; writeScope: boolean; createdAt: string; expiresAt: string; revokedAt: string | null }
        >,
        loadError: true,
      },
      { headers: privateHeaders },
    );
  }
}

export default function DevelopersHistory() {
  const { events, nextCursor, filter, studentsByUid, itemNamesByUid, apiKeysByUid, loadError } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const filterButtons = useMemo(
    () =>
      historyFilters.map((value) => ({
        text: filterLabels[value],
        active: filter === value,
        onToggle: (active: boolean) => {
          if (active) navigate(`/developers/history?filter=${value}`);
        },
      })),
    [filter, navigate],
  );
  const nextPage = nextCursor
    ? `/developers/history?${new URLSearchParams({ filter, cursor: nextCursor }).toString()}`
    : null;
  const dateGroups = groupEventsByDate(events);

  return (
    <DeveloperPage>
      <div>
        <header>
          <SubTitle text="변경 기록" />
        </header>

        {!loadError ? (
          <FilterButtons
            buttonProps={filterButtons}
            exclusive
            atLeastOne
            surface="page"
            className="my-0 mb-5"
            buttonGroupClassName="gap-x-1.5"
          />
        ) : null}

        {loadError ? (
          <SectionCard>
            <div className="flex flex-col items-center py-12 text-center">
              <ExclamationCircleIcon className="size-12 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">변경 기록을 불러오지 못했어요</p>
              <p className="mt-1 text-sm text-muted-foreground">잠시 후 다시 시도해주세요.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                disabled={revalidator.state !== "idle"}
                onClick={() => revalidator.revalidate()}
              >
                {revalidator.state === "idle" ? "다시 시도" : "불러오는 중..."}
              </Button>
            </div>
          </SectionCard>
        ) : events.length === 0 ? (
          <SectionCard>
            <EmptyView
              Icon={ClockIcon}
              text="표시할 변경 기록이 없어요"
              description="학생 상태를 바꾸거나 API 키를 발급하면 이곳에서 확인할 수 있어요."
              className="my-8"
            />
          </SectionCard>
        ) : (
          <div className="space-y-6">
            {dateGroups.map(({ key, title, events: groupedEvents }) => (
              <section key={key}>
                <h3 className="mb-2 mt-6 text-xs font-semibold text-muted-foreground first:mt-0">{title}</h3>
                <div className="rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5">
                  <ol className="space-y-6" aria-label={`${title} 변경 기록`}>
                    {groupedEvents.map((event) => (
                      <HistoryEvent
                        key={`${event.kind}-${event.id}`}
                        event={event}
                        studentName={event.studentUid ? (studentsByUid[event.studentUid] ?? null) : null}
                        itemNamesByUid={itemNamesByUid}
                        apiKeysByUid={apiKeysByUid}
                      />
                    ))}
                  </ol>
                </div>
              </section>
            ))}
          </div>
        )}

        {nextPage && !loadError ? (
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" to={nextPage}>
              이전 기록 더 보기
            </Button>
          </div>
        ) : null}
      </div>
    </DeveloperPage>
  );
}

type DateGroup = { key: string; title: string; events: ApiAuditEvent[] };

function groupEventsByDate(events: ApiAuditEvent[]): DateGroup[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const keys = new Map<string, ApiAuditEvent[]>();
  for (const event of events) {
    const parts = formatter.formatToParts(new Date(event.createdAt));
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    const key = `${value("year")}-${value("month")}-${value("day")}`;
    keys.set(key, [...(keys.get(key) ?? []), event]);
  }
  const todayParts = formatter.formatToParts(new Date());
  const todayValue = (type: Intl.DateTimeFormatPartTypes) => todayParts.find((part) => part.type === type)?.value ?? "";
  const today = `${todayValue("year")}-${todayValue("month")}-${todayValue("day")}`;
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });

  return [...keys].map(([key, groupedEvents]) => ({
    key,
    title: `${dateFormatter.format(new Date(`${key}T12:00:00+09:00`))}${key === today ? " (오늘)" : ""}`,
    events: groupedEvents,
  }));
}

function HistoryEvent({
  event,
  studentName,
  itemNamesByUid,
  apiKeysByUid,
}: {
  event: ApiAuditEvent;
  studentName: string | null;
  itemNamesByUid: Record<string, string>;
  apiKeysByUid: Record<
    string,
    { readScope: boolean; writeScope: boolean; createdAt: string; expiresAt: string; revokedAt: string | null }
  >;
}) {
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  });
  const time = timeFormatter.format(new Date(event.createdAt));
  const actor = event.kind === "key" ? "키 관리" : getHistoryActor(event);

  return (
    <li>
      <div className="flex gap-3">
        <time className="w-10 shrink-0 text-sm tabular-nums text-muted-foreground md:w-12" dateTime={event.createdAt}>
          {time}
        </time>
        <p className="text-sm font-semibold">{actor}</p>
      </div>
      <div className="ml-[3.25rem] mt-2.5 min-w-0 sm:ml-[3.75rem]">
        {event.kind === "key" ? (
          <KeyEvent event={event} apiKeysByUid={apiKeysByUid} />
        ) : (
          <StudentEvent event={event} studentName={studentName} itemNamesByUid={itemNamesByUid} />
        )}
      </div>
    </li>
  );
}

function KeyEvent({
  event,
  apiKeysByUid,
}: {
  event: ApiAuditEvent;
  apiKeysByUid: Record<
    string,
    { readScope: boolean; writeScope: boolean; createdAt: string; expiresAt: string; revokedAt: string | null }
  >;
}) {
  const key = event.apiKeyUid ? apiKeysByUid[event.apiKeyUid] : undefined;
  const scopes = key
    ? [key.readScope ? "학생 읽기" : null, key.writeScope ? "학생 쓰기" : null].filter(Boolean).join(" · ")
    : null;
  const date = (value: string) =>
    new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
  if (event.action !== "issued" && event.action !== "revoked") {
    return <p className="text-sm text-muted-foreground">키 정보를 확인할 수 없어요</p>;
  }
  const action = event.action === "revoked" ? "폐기" : "발급";

  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <KeyIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold">
          API 키 {action} · {event.apiKeyName ?? "키 이름을 확인할 수 없어요"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {key && scopes
            ? `${scopes} · ${action === "발급" ? `${date(key.expiresAt)} 만료` : `${date(key.createdAt)} 발급`}`
            : "키 정보를 확인할 수 없어요"}
        </p>
      </div>
    </div>
  );
}

function StudentEvent({
  event,
  studentName,
  itemNamesByUid,
}: {
  event: ApiAuditEvent;
  studentName: string | null;
  itemNamesByUid: Record<string, string>;
}) {
  const changes = getChangedValues(event.beforeState, event.afterState);
  const groups = groupChanges(changes);

  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <ProfileImage studentUid={event.studentUid && studentName ? event.studentUid : null} imageSize={8} />
        <h3 className={`break-words text-sm font-semibold ${studentName ? "" : "text-muted-foreground"}`}>
          {studentName ?? "학생 정보를 찾을 수 없어요"}
        </h3>
      </div>
      {groups.length > 0 ? (
        <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          {groups.map(({ label, values }) => (
            <ChangeGroup key={label} label={label} values={values} itemNamesByUid={itemNamesByUid} />
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">상태 변경 값이 기록되지 않았어요.</p>
      )}
    </>
  );
}

function ChangeGroup({
  label,
  values,
  itemNamesByUid,
}: {
  label: string;
  values: Change[];
  itemNamesByUid: Record<string, string>;
}) {
  return (
    <>
      <dt className="pt-0.5 text-xs font-semibold text-muted-foreground sm:text-right">{label}</dt>
      <dd className="min-w-0 break-words">
        {values.map((change, index) => (
          <span key={change.key}>
            {index > 0 ? <span className="text-muted-foreground"> · </span> : null}
            <span>{change.label} </span>
            <span className="text-muted-foreground">
              <span className="sr-only">이전 값: </span>
              {renderAuditValue(change.key, change.before, itemNamesByUid)}
            </span>
            <span className="text-muted-foreground"> → </span>
            <span className="font-medium">
              <span className="sr-only">변경 후 값: </span>
              {renderAuditValue(change.key, change.after, itemNamesByUid)}
            </span>
          </span>
        ))}
      </dd>
    </>
  );
}

function getHistoryActor(event: ApiAuditEvent): string {
  if (event.source === "api") return `API · ${event.apiKeyName ?? "키 이름을 확인할 수 없어요"}`;
  if (event.source === "sync_draft") return "데이터 반영";
  if (event.source === "recruitment_result") return "모집 결과 기록";
  if (directHistorySources.includes(event.source)) return "직접 수정";
  return "확인할 수 없음";
}

type Change = { key: string; group: string; label: string; before: unknown; after: unknown };

const currentFields: Array<{ key: string; label: string }> = [
  { key: "level", label: "학생 Lv" },
  { key: "skillEx", label: "EX 스킬" },
  { key: "skillNormal", label: "기본 스킬" },
  { key: "skillEnhanced", label: "강화 스킬" },
  { key: "skillSub", label: "서브 스킬" },
  { key: "equip1", label: "장비1" },
  { key: "equip2", label: "장비2" },
  { key: "equip3", label: "장비3" },
  { key: "equip1Level", label: "장비1 레벨" },
  { key: "equip2Level", label: "장비2 레벨" },
  { key: "equip3Level", label: "장비3 레벨" },
  { key: "equipSpecial", label: "애용품" },
  { key: "weaponLevel", label: "고유무기 Lv" },
  { key: "abilityHp", label: "HP 해방" },
  { key: "abilityAtk", label: "공격력 해방" },
  { key: "abilityHeal", label: "치유력 해방" },
];
const goalFields: Array<{ key: string; label: string }> = [
  { key: "targetLevel", label: "학생 Lv" },
  { key: "targetSkillEx", label: "EX 스킬" },
  { key: "targetSkillNormal", label: "기본 스킬" },
  { key: "targetSkillEnhanced", label: "강화 스킬" },
  { key: "targetSkillSub", label: "서브 스킬" },
  { key: "targetEquip1", label: "장비1" },
  { key: "targetEquip2", label: "장비2" },
  { key: "targetEquip3", label: "장비3" },
  { key: "targetEquipSpecial", label: "애용품" },
  { key: "targetWeaponLevel", label: "고유무기 Lv" },
  { key: "targetAbilityHp", label: "HP 해방" },
  { key: "targetAbilityAtk", label: "공격력 해방" },
  { key: "targetAbilityHeal", label: "치유력 해방" },
];

function getChangedValues(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Change[] {
  const beforeValues = flattenSnapshot(before);
  const afterValues = flattenSnapshot(after);
  const changes: Change[] = [];
  const add = (key: string, group: string, label: string, beforeValue: unknown, afterValue: unknown) => {
    const normalizedBefore = normalizeAuditValue(key, beforeValue);
    const normalizedAfter = normalizeAuditValue(key, afterValue);
    if (JSON.stringify(normalizedBefore) === JSON.stringify(normalizedAfter)) return;
    changes.push({ key, group, label, before: normalizedBefore, after: normalizedAfter });
  };

  add("tier", "현재 상태", "성급", beforeValues.current.tier, afterValues.current.tier);
  add("weaponTier", "현재 상태", "고유무기 성급", beforeValues.current.weaponTier, afterValues.current.weaponTier);
  for (const field of currentFields)
    add(field.key, "현재 상태", field.label, beforeValues.current[field.key], afterValues.current[field.key]);
  add("bond", "현재 상태", "인연 랭크", beforeValues.current.bond, afterValues.current.bond);
  add("bondExp", "현재 상태", "인연 경험치", beforeValues.current.bondExp, afterValues.current.bondExp);
  add("targetTier", "육성 목표", "성급", beforeValues.target.targetTier, afterValues.target.targetTier);
  add(
    "targetWeaponTier",
    "육성 목표",
    "고유무기 성급",
    beforeValues.target.targetWeaponTier,
    afterValues.target.targetWeaponTier,
  );
  for (const field of goalFields)
    add(field.key, "육성 목표", field.label, beforeValues.target[field.key], afterValues.target[field.key]);
  add(
    "relationshipTargetLevel",
    "육성 목표",
    "인연 랭크",
    beforeValues.target.relationshipTargetLevel,
    afterValues.target.relationshipTargetLevel,
  );
  add("giftPlan", "선물 계획", "선물 계획", beforeValues.target.giftPlan, afterValues.target.giftPlan);
  return changes;
}

function groupChanges(changes: Change[]): Array<{ label: string; values: Change[] }> {
  const groupLabels = ["현재 상태", "육성 목표", "선물 계획"];
  return groupLabels.flatMap((label) => {
    const values = changes.filter((change) => change.group === label);
    return values.length > 0 ? [{ label, values }] : [];
  });
}

type SnapshotValues = { current: Record<string, unknown>; target: Record<string, unknown> };

function flattenSnapshot(snapshot: Record<string, unknown> | null): SnapshotValues {
  const empty = (): SnapshotValues => ({ current: {}, target: {} });
  if (!snapshot) return empty();
  const canonicalState = asRecord(snapshot.state);
  const canonicalTarget = asRecord(snapshot.target);
  if (canonicalState || canonicalTarget) {
    const current = { ...(canonicalState ?? {}) };
    if (typeof current.tier === "number") {
      current.internalTier = current.tier;
      current.weaponTier = Math.max(0, current.tier - 5);
      current.tier = Math.min(current.tier, 5);
    }
    if (Object.hasOwn(current, "relationshipCurrentLevel")) current.bond = current.relationshipCurrentLevel;
    if (Object.hasOwn(current, "relationshipCurrentExp")) current.bondExp = current.relationshipCurrentExp;
    const target = { ...(canonicalTarget ?? {}) };
    if (typeof target.targetTier === "number") {
      target.internalTargetTier = target.targetTier;
      target.targetWeaponTier = Math.max(0, target.targetTier - 5);
      target.targetTier = Math.min(target.targetTier, 5);
    }
    if (Object.hasOwn(target, "targetBond")) target.relationshipTargetLevel = target.targetBond;
    return { current, target };
  }

  const recruited = asRecord(snapshot.recruited) ?? {};
  const growth = asRecord(snapshot.growth) ?? {};
  const relationship = asRecord(snapshot.relationship) ?? {};
  const current = { ...recruited };
  if (typeof current.tier === "number") {
    current.internalTier = current.tier;
    current.weaponTier = Math.max(0, current.tier - 5);
    current.tier = Math.min(current.tier, 5);
  }
  if (Object.hasOwn(relationship, "currentLevel")) current.bond = relationship.currentLevel;
  if (Object.hasOwn(relationship, "currentExp")) current.bondExp = relationship.currentExp;
  const target = { ...growth };
  if (typeof target.targetTier === "number") {
    target.internalTargetTier = target.targetTier;
    target.targetWeaponTier = Math.max(0, target.targetTier - 5);
    target.targetTier = Math.min(target.targetTier, 5);
  }
  if (Object.hasOwn(relationship, "targetLevel")) target.relationshipTargetLevel = relationship.targetLevel;
  if (Object.hasOwn(relationship, "items")) target.giftPlan = relationship.items;
  return { current, target };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAuditValue(key: string, value: unknown): unknown {
  if (value !== undefined && value !== null) return value;
  return key === "giftPlan" ? {} : null;
}

function renderAuditValue(key: string, value: unknown, itemNamesByUid: Record<string, string>): React.ReactNode {
  if (value === undefined) return "기록 없음";
  if (value === null) return "비움";
  if ((key === "tier" || key === "targetTier") && typeof value === "number") {
    return <StudentTierLabel tier={Math.min(value, 5)} />;
  }
  if ((key === "weaponTier" || key === "targetWeaponTier") && typeof value === "number") {
    return value === 0 ? "미장착" : <StudentTierLabel tier={5 + value} />;
  }
  if (key === "giftPlan") return formatGiftPlan(value, itemNamesByUid);
  if (typeof value === "object") return "값이 기록돼 있어요";
  return String(value);
}

function formatGiftPlan(value: unknown, itemNamesByUid: Record<string, string>): string {
  const plan = asRecord(value);
  if (!plan) return "확인할 수 없어요";
  const gifts = Object.entries(plan).filter(([, count]) => typeof count === "number" && count > 0);
  if (gifts.length === 0) return "계획 없음";
  return gifts.map(([uid, count]) => `${itemNamesByUid[uid] ?? "선물 정보를 찾을 수 없어요"} × ${count}`).join(" · ");
}
