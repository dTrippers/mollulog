import { Link } from "react-router";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import {
  type HomeCampaign,
  type HomeJointFiringDrill,
  type HomeJointFiringDrillSelection,
  selectHomeCampaigns,
  selectHomeJointFiringDrill,
} from "~/domain/home-content";
import { formatInstant, nowUtcIso, parseUtcTimestamp } from "~/lib/date-time";
import { relativeTime } from "~/locales/ko";
import type { HomeSourceResult } from "~/views/home";

export default function HomeStatusSummary({
  campaigns: campaignSource,
  jointFiringDrills: drillSource,
}: {
  campaigns: HomeSourceResult<HomeCampaign[]>;
  jointFiringDrills: HomeSourceResult<HomeJointFiringDrill[]>;
}) {
  const displayTimeZone = useDisplayTimeZone();
  const now = nowUtcIso();
  const campaignSelection =
    campaignSource.status === "success" ? selectHomeCampaigns(campaignSource.data, now) : { status: "error" as const };
  const campaignFailed = campaignSelection.status === "error";
  const campaigns = campaignSelection.status === "success" ? campaignSelection.campaigns : [];
  const drillSelection: HomeJointFiringDrillSelection =
    drillSource.status === "success" ? selectHomeJointFiringDrill(drillSource.data, now) : { kind: "error" };

  return (
    <dl className="mt-3 flex flex-col gap-1.5">
      <div className="flex items-baseline gap-3">
        <dt className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">캠페인</dt>
        <dd className="flex min-w-0 flex-1 flex-col items-start gap-y-1 text-sm">
          {campaignFailed ? (
            <span className="text-muted-foreground">캠페인 정보를 불러오지 못했어요</span>
          ) : campaigns.length === 0 ? (
            <span className="text-muted-foreground">진행중인 캠페인 없음</span>
          ) : (
            campaigns.map((campaign) => (
              <span key={campaign.uid} className="break-keep">
                <span className="font-medium text-foreground">
                  {campaign.categoryLabel} 보상량 {campaign.multiplier}배
                </span>
                <span className="text-muted-foreground">
                  {` · ${relativeTime(parseUtcTimestamp(campaign.endAt), { timeZone: displayTimeZone })} 종료`}
                </span>
              </span>
            ))
          )}
        </dd>
      </div>

      <div className="flex items-baseline gap-3">
        <dt className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">종합전술시험</dt>
        <dd className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          {drillSelection.kind === "ongoing" ? (
            <span className="whitespace-nowrap">
              <span className="font-medium text-foreground">
                {drillSelection.season}차 {drillSelection.drillTypeLabel}시험
              </span>
              <span className="text-muted-foreground">
                {` · ${relativeTime(parseUtcTimestamp(drillSelection.endAt), { timeZone: displayTimeZone })} 종료`}
              </span>
            </span>
          ) : drillSelection.kind === "upcoming" ? (
            <span className="whitespace-nowrap">
              <span className="font-medium text-foreground">
                {drillSelection.season}차 {drillSelection.drillTypeLabel}시험
              </span>
              <span className="text-muted-foreground">
                {` · ${formatInstant(drillSelection.startAt, { timeZone: displayTimeZone, format: "M/D" })} 시작 예정`}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {drillSelection.kind === "error" ? "일정을 불러오지 못했어요" : "예정 없음"}
            </span>
          )}
          <Link
            to="/futures"
            className="ml-auto whitespace-nowrap rounded-md -mx-1.5 -my-0.5 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            전체 일정 →
          </Link>
        </dd>
      </div>
    </dl>
  );
}
