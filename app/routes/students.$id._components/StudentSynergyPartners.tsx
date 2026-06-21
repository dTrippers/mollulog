import type { ReactNode } from "react";
import { Link } from "react-router";
import { LoadingSkeleton, ProfileImage } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import type { StudentAnalysisSynergyPartner } from "~/lib/ranks/student-analysis";
import type { Role } from "~/models/content.d";
import { formatTierLabel } from "./raidTierVisual";

type StudentSynergyPartnersProps = {
  partners: StudentAnalysisSynergyPartner[];
  loading: boolean;
  allStudents: Record<string, { name: string; attackType: Attack; defenseType: Defense; role: Role }>;
  recruitedStudentTiers: Record<string, number>;
};

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function StudentSynergyPartners({
  partners,
  loading,
  allStudents,
  recruitedStudentTiers,
}: StudentSynergyPartnersProps) {
  if (loading) {
    return (
      <CardShell>
        <Header />
        <LoadingSkeleton noOuterMargin className="-mt-4" />
      </CardShell>
    );
  }

  const visiblePartners = partners.flatMap((partner) => {
    const student = allStudents[partner.partnerUid];
    return student ? [{ partner, student }] : [];
  });
  if (visiblePartners.length === 0) {
    return null;
  }

  return (
    <CardShell>
      <Header />
      <div className="grid gap-3 md:grid-cols-3">
        {visiblePartners.map(({ partner, student }, index) => {
          const tier = recruitedStudentTiers[partner.partnerUid] ?? null;
          const barWidth = Math.min(Math.max(partner.coRate, 0), 1) * 100;

          return (
            <Link
              key={partner.partnerUid}
              to={`/students/${partner.partnerUid}`}
              className="flex h-full flex-col rounded-md border border-neutral-200 p-3 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-300">
                    {index + 1}
                  </span>
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{student.name}</p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {percentFormatter.format(partner.coRate)}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="shrink-0">
                  <ProfileImage studentUid={partner.partnerUid} imageSize={10} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="space-y-1">
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      내 학생{" "}
                      {tier !== null ?
                        <span className="font-semibold text-blue-600 dark:text-blue-300">{formatTierLabel(tier)}</span> :
                        <span className="font-semibold text-blue-600 dark:text-blue-300">미모집</span>}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      함께 출전{" "}
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {partner.coCount.toLocaleString()}회
                      </span>
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </CardShell>
  );
}

function Header() {
  return (
    <div className="mb-4">
      <p className="text-base font-bold">함께 쓰는 학생</p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">함께 편성된 횟수가 많은 학생이에요.</p>
    </div>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      {children}
    </div>
  );
}
