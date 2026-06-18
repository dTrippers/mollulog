import type { ReactNode } from "react";
import { Link } from "react-router";
import { StudentCard } from "~/components/features/students";
import { LoadingSkeleton } from "~/components/primitives";
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
        <LoadingSkeleton />
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
        {visiblePartners.map(({ partner, student }) => {
          const tier = recruitedStudentTiers[partner.partnerUid];

          return (
            <Link
              key={partner.partnerUid}
              to={`/students/${partner.partnerUid}`}
              className="flex items-center gap-3 rounded-md border border-neutral-200 p-3 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              <div className="w-14 shrink-0">
                <StudentCard
                  uid={partner.partnerUid}
                  name={student.name}
                  attackType={student.attackType}
                  defenseType={student.defenseType}
                  role={student.role}
                  circular
                  hideName
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{student.name}</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  공출현 {percentFormatter.format(partner.coRate)} · {partner.coCount.toLocaleString()}회
                </p>
                {tier != null && (
                  <span className="mt-2 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    보유 {formatTierLabel(tier)}
                  </span>
                )}
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
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">같은 파티에 함께 등장한 상위 학생입니다.</p>
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
