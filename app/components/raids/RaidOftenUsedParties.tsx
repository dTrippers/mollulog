import type { Role } from "~/models/content.d";
import type { Attack, Defense } from "~/graphql/graphql";
import { StudentCards } from "~/components/students";
import { ActionCard } from "~/components/molecules/editor";

type ServerStudent = {
  uid: string;
  level: number;
  tier: number;
  weaponTier?: number;
  isAssist?: boolean;
};

type ServerStudentSlot = {
  slot: "student" | "empty";
  student?: ServerStudent;
  empty?: Record<string, never>;
};

type Party = {
  students: ServerStudentSlot[];
};

type RaidOftenUsedPartiesProps = {
  oftenUsedParties: Array<{
    count: number;
    maxRank: number;
    maxScore: number;
    parties: Party[];
  }>;
  allStudents: Record<string, { name: string; attackType: Attack; defenseType: Defense; role: Role }>;
};

export default function RaidOftenUsedParties({ oftenUsedParties, allStudents }: RaidOftenUsedPartiesProps) {
  if (oftenUsedParties.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        많이 사용된 편성 데이터가 없어요
      </div>
    );
  }

  // Take only TOP 5
  const top5Parties = oftenUsedParties.slice(0, 5);
  return (
    <div className="space-y-4">
      {top5Parties.map(({ count, maxRank, maxScore, parties }, index) => {
        // Use the first party as representative (all parties in the array have the same composition)
        return (
          <ActionCard key={`party-${index}`} actions={[]}>
            <div className="mb-2">
              <span className="text-lg font-bold">{index + 1}위</span>
              <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">
                {count.toLocaleString()}회
              </span>
            </div>
            <div className="flex flex-col-reverse md:flex-row md:items-center gap-4">
              <div>
                {parties.map((party, partyIndex) => (
                  <div key={`party-${index}-${partyIndex}`}>
                    <StudentCards
                      students={party.students.map((slot) => {
                        if (slot.slot === "empty" || !slot.student) {
                          return { uid: null };
                        }

                        const student = allStudents[slot.student.uid]!;
                        return {
                          uid: slot.student.uid,
                          name: student.name,
                          hideName: true,
                          attackType: student.attackType,
                          defenseType: student.defenseType,
                          role: student.role,
                        };
                      })}
                      pcGrid={8}
                    />
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 md:w-40">
                <div className="space-y-1 text-sm">
                  {maxRank !== undefined && (
                    <div className="text-neutral-500 dark:text-neutral-400">
                      <span className="font-medium">최고 순위:</span>{" "}
                      <span className="text-neutral-900 dark:text-neutral-100">
                        {maxRank.toLocaleString()}위
                      </span>
                    </div>
                  )}
                  <div className="text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium">최고 점수:</span>{" "}
                    <span className="text-neutral-900 dark:text-neutral-100">
                      {maxScore.toLocaleString()}점
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </ActionCard>
        );
      })}
    </div>
  );
}

