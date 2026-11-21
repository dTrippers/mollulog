import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  formatRaidClearResult,
  formatRaidRank,
  formatRaidScore,
  RAID_RECORD_RAID_TYPE_LABEL,
  RAID_RECORD_SERVER_LABEL,
} from "~/components/v2/features/raid-records/raid-record-format";
import {
  DefenseTypeLabel,
  RaidBossBackdrop,
  RaidRankTierBadge,
  RaidSeasonMeta,
  RankStatusPill,
} from "~/components/v2/features/raid-records/RaidRecordBits";
import { RaidPartyView } from "~/components/v2/features/raid-records/RaidPartyView";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { nowUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { defenseTypeLocale } from "~/locales/ko";
import { getRaidRecord, getRaidRecordSeasons } from "~/models/raid-record";
import { getAllStudents } from "~/models/student";
import { toRaidRecordRowView } from "~/views/raid-records";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { RaidRecordPageError } from "./$username.raids._components/RaidRecordPageError";

export const meta: MetaFunction<typeof loader> = ({ data, params }) => {
  const title = data
    ? `${params.username} - ${RAID_RECORD_RAID_TYPE_LABEL[data.row.season.raidType]} #${data.row.season.seasonIndex} ${data.row.season.boss.name} 기록 | 몰루로그`
    : "총력전·대결전 기록 | 몰루로그";
  return [{ title }];
};

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const record = params.id ? await getRaidRecord(env, sensei.id, params.id, { ctx }) : null;
  if (!record) throw routeError(404, "raid_record.not_found", "기록을 찾을 수 없어요");
  // The owner reads and changes a record on the edit screen.
  if (currentUser?.id === sensei.id) throw redirect(`/@${sensei.username}/raids/${record.uid}/edit`);

  const [seasons, students] = await Promise.all([getRaidRecordSeasons(env, record.server), getAllStudents(env, true)]);
  const season = seasons.find(
    (candidate) => candidate.raidType === record.raidType && candidate.seasonIndex === record.seasonIndex,
  );
  const row = season ? toRaidRecordRowView(record, season, nowUtcIso()) : null;
  if (!row) throw routeError(500, "raid_record.season_unavailable");
  const partyStudentUids = new Set(record.parties.flatMap((party) => party.units.map((unit) => unit.studentUid)));
  return {
    username: sensei.username,
    row,
    memo: record.memo,
    parties: record.parties,
    // Only the names the parties need.
    studentNames: students
      .filter((student) => partyStudentUids.has(student.uid))
      .map((student) => ({ uid: student.uid, name: student.name })),
  };
};

export function ErrorBoundary() {
  return <RaidRecordPageError title="총력전·대결전 기록" />;
}

export default function RaidRecordDetail() {
  const { username, row, memo, parties, studentNames } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();
  const { season } = row;
  const studentsByUid = new Map(studentNames.map((student) => [student.uid, student] as const));
  const listTo = `/@${username}/raids?server=${season.server}&type=${season.raidType}`;
  const defenseTypes = season.scoreDefenseTypes.map(({ defenseType }) => defenseType);

  return (
    <V2Page width="reading">
      <PageHeader
        back={{ title: `@${username}의 총력전·대결전 기록`, to: listTo }}
        title={`#${season.seasonIndex} ${season.boss.name}`}
        details={
          <span className="flex flex-col gap-0.5">
            <span className="text-xs text-v2-fg-secondary">
              {RAID_RECORD_RAID_TYPE_LABEL[season.raidType]} · {RAID_RECORD_SERVER_LABEL[season.server]}
            </span>
            <RaidSeasonMeta
              terrain={season.terrain}
              defenseTypes={season.displayDefenseTypes}
              startAt={season.startAt}
              endAt={season.endAt}
              timeZone={timeZone}
            />
          </span>
        }
      />
      <PageMain>
        <div className="flex min-w-0 max-w-[62.5rem] flex-col gap-v2-group-gap">
          <section
            aria-label="결과"
            className="relative flex flex-col gap-3 overflow-hidden rounded-lg bg-v2-surface p-v2-block-p [&>*:not(img)]:relative"
          >
            <RaidBossBackdrop bossUid={season.boss.uid} />
            <DetailRow label="점수">
              {season.raidType === "total_assault" ? (
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-semibold text-v2-fg tabular-nums">{formatRaidScore(row.totalScore)}</span>
                  <ClearResult difficulty={row.scores[0]?.difficulty ?? null} clearTimeMs={row.scores[0]?.clearTimeMs ?? null} />
                </span>
              ) : (
                <span className="flex flex-col gap-1">
                  {row.scores.map((entry) => (
                    <span key={entry.defenseType} className="grid grid-cols-[6.5rem_auto] items-baseline gap-x-3 sm:grid-cols-[7.5rem_10rem_auto]">
                      <DefenseTypeLabel defenseType={entry.defenseType} className="text-sm text-v2-fg" />
                      <span className="text-right text-sm font-semibold text-v2-fg tabular-nums">
                        {entry.score === null ? <span className="font-normal text-v2-fg-tertiary">입력 안 함</span> : formatRaidScore(entry.score)}
                      </span>
                      <span className="col-start-2 sm:col-start-auto">
                        <ClearResult difficulty={entry.difficulty} clearTimeMs={entry.clearTimeMs} />
                      </span>
                    </span>
                  ))}
                  <span className="grid grid-cols-[6.5rem_auto] items-baseline gap-x-3 border-t border-v2-divider pt-1.5 sm:grid-cols-[7.5rem_10rem_auto]">
                    <span className="text-sm font-semibold text-v2-fg">합산</span>
                    <span className="text-right text-base font-semibold text-v2-fg tabular-nums">{formatRaidScore(row.totalScore)}</span>
                  </span>
                </span>
              )}
            </DetailRow>
            <DetailRow label="순위">
              {row.rank === null ? (
                <span className="text-sm text-v2-fg-tertiary">순위 없음</span>
              ) : (
                <span className="flex items-center gap-2">
                  <RaidRankTierBadge
                    server={season.server}
                    raidType={season.raidType}
                    seasonIndex={season.seasonIndex}
                    rank={row.rank}
                  />
                  <span className="text-base font-semibold text-v2-fg tabular-nums">{formatRaidRank(row.rank)}</span>
                  <RankStatusPill status={row.rankStatus} />
                </span>
              )}
            </DetailRow>
            {memo ? (
              <DetailRow label="메모">
                <p className="text-sm whitespace-pre-wrap text-v2-fg">{memo}</p>
              </DetailRow>
            ) : null}
          </section>
          {parties.length > 0 ? (
            <section aria-labelledby="raid-record-parties" className="flex flex-col gap-3 rounded-lg bg-v2-surface p-v2-block-p">
              <h2 id="raid-record-parties" className="text-base font-semibold text-v2-fg">
                편성
              </h2>
              {defenseTypes.map((defenseType) => {
                const typeParties = parties.filter((party) => party.defenseType === defenseType);
                if (typeParties.length === 0) return null;
                const prefix = season.raidType === "elimination" ? `${defenseTypeLocale[defenseType]} ` : "";
                return typeParties.map((party, index) => (
                  <RaidPartyView
                    // biome-ignore lint/suspicious/noArrayIndexKey: saved parties have no id and keep their order
                    key={`${defenseType}-${index}`}
                    party={party}
                    title={`${prefix}${index + 1}파티`}
                    studentsByUid={studentsByUid}
                  />
                ));
              })}
            </section>
          ) : null}
        </div>
      </PageMain>
    </V2Page>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      <span className="text-sm font-medium text-v2-fg-secondary sm:pt-0.5">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ClearResult({ difficulty, clearTimeMs }: { difficulty: string | null; clearTimeMs: number | null }) {
  const text = formatRaidClearResult(difficulty, clearTimeMs);
  if (!text) return null;
  const [label, time] = text.split(" · ");
  return (
    <span className="text-sm text-v2-fg-secondary tabular-nums">
      <span className="font-semibold text-v2-fg">{label}</span> · {time}
    </span>
  );
}
