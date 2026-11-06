import { ArrowPathIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { RoundStudentImage } from "~/components/v2/features/students/RoundStudentImage";
import { Button } from "~/components/v2/primitives/Button";
import { Skeleton } from "~/components/v2/primitives/Skeleton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import type { StudentAnalysisSynergyPartner } from "~/lib/ranks/student-analysis";
import { formatTierLabel } from "./raidTierVisual";

type StudentSynergyPartnersProps = {
  partners: StudentAnalysisSynergyPartner[];
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  signedIn: boolean;
  allStudents: Record<string, { name: string }>;
  recruitedStudentTiers: Record<string, number>;
  className?: string;
};

const percentFormatter = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });

export default function StudentSynergyPartners({ partners, loading, failed = false, onRetry, signedIn, allStudents, recruitedStudentTiers, className }: StudentSynergyPartnersProps) {
  const visiblePartners = partners.flatMap((partner) => {
    const student = allStudents[partner.partnerUid];
    return student ? [{ partner, student }] : [];
  });
  const unresolvedPartnerCount = partners.length - visiblePartners.length;
  if (!loading && !failed && visiblePartners.length === 0 && unresolvedPartnerCount === 0) return null;

  return (
    <section className={`min-w-0 ${className ?? ""}`} aria-label="함께 쓰는 학생">
      <div className="mb-2 flex min-h-7 items-center"><h3 className="text-base leading-[1.4] font-semibold text-v2-fg">함께 쓰는 학생</h3></div>
      <div className="rounded-lg bg-v2-surface p-v2-block-p">
        {loading ? (
          <div className="space-y-2" aria-busy="true">{["skeleton-partner-1", "skeleton-partner-2", "skeleton-partner-3"].map((key) => <Skeleton key={key} className="h-10 w-full" />)}</div>
        ) : null}
        {!loading && (failed || unresolvedPartnerCount > 0) ? (
          <StatusNotice className="[&>svg]:hidden [&>div:last-child]:-my-1" tone="danger" action={onRetry ? <Button variant="text" size="sm" onClick={onRetry}><ArrowPathIcon className="size-3.5" aria-hidden="true" />다시 시도</Button> : undefined}>
            <span className="relative block pl-6 leading-[1.43]"><XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />분석 정보를 불러오지 못했어요</span>
          </StatusNotice>
        ) : null}
        {!loading && visiblePartners.length > 0 ? (
          <ol className="flex flex-col gap-4">
            {visiblePartners.map(({ partner, student }, index) => {
              const tier = signedIn ? recruitedStudentTiers[partner.partnerUid] ?? null : null;
              const ratioWidth = Math.min(Math.max(partner.coRate, 0), 1) * 100;
              return (
                <li key={partner.partnerUid}>
                  <Link
                    to={`/students/${partner.partnerUid}`}
                    {...getV2LinkTransitionProps("crossfade")}
                    className="group grid grid-cols-[1.25rem_36px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                  >
                    <span className="text-center text-[13px] leading-[1.43] font-semibold text-v2-fg-tertiary tabular-nums">{index + 1}</span>
                    <RoundStudentImage studentUid={partner.partnerUid} size={10} className="!h-auto !w-9 !aspect-[5/6] !rounded-md" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm leading-[1.43] font-medium text-v2-fg group-hover:underline">{student.name}</span>
                      <span className="block truncate text-xs leading-[1.43] text-v2-fg-tertiary">
                        함께 출전 {partner.coCount.toLocaleString()}회{signedIn ? <> · 내 학생 {tier === null ? <span>미모집</span> : <span>{formatTierLabel(tier)}</span>}</> : null}
                      </span>
                    </span>
                    <span className="text-right text-sm leading-[1.43] font-semibold text-v2-fg tabular-nums">{percentFormatter.format(partner.coRate)}</span>
                    <span className="col-start-3 col-end-5 block h-1.5 overflow-hidden rounded-full bg-v2-inset" aria-hidden="true">
                      <span className="block h-full rounded-full bg-v2-fg-secondary" style={{ width: `${ratioWidth}%` }} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
