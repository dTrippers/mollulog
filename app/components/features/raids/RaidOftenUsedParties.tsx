import { IdentificationIcon, TrophyIcon } from "@heroicons/react/24/outline";
import { Button } from "~/components/primitives";
import { buildExactPartiesPath, compactExactParties } from "~/domain/raid-exact-parties";
import type { Attack, Defense } from "~/graphql/graphql";
import type { Role } from "~/models/content.d";
import RaidPartyCard, { type RaidPartyRow, type RaidPartySlot } from "./RaidPartyCard";

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

type RaidOftenUsedParty = {
  count: number;
  maxRank: number;
  maxScore: number;
  parties: Party[];
};

type RaidOftenUsedPartiesProps = {
  oftenUsedParties: RaidOftenUsedParty[];
  allStudents: Record<string, { name: string; attackType: Attack; defenseType: Defense; role: Role }>;
  recruitedStudentTiers: Record<string, number>;
  showUnrecruitedStudents?: boolean;
  cardClassName?: string;
  summaryClassName?: string;
  ranksPath?: string;
};

const VISIBLE_PARTY_COUNT = 3;

export default function RaidOftenUsedParties({
  oftenUsedParties,
  allStudents,
  recruitedStudentTiers,
  showUnrecruitedStudents = false,
  cardClassName,
  summaryClassName,
  ranksPath,
}: RaidOftenUsedPartiesProps) {
  if (oftenUsedParties.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">많이 사용된 편성 데이터가 없어요</div>;
  }

  return (
    <div className="space-y-3">
      {oftenUsedParties.slice(0, 5).map((oftenUsedParty, index) => (
        <OftenUsedPartyCard
          key={getOftenUsedPartyKey(oftenUsedParty, index)}
          rank={index + 1}
          oftenUsedParty={oftenUsedParty}
          allStudents={allStudents}
          recruitedStudentTiers={recruitedStudentTiers}
          showUnrecruitedStudents={showUnrecruitedStudents}
          cardClassName={cardClassName}
          summaryClassName={summaryClassName}
          ranksPath={ranksPath}
        />
      ))}
    </div>
  );
}

function OftenUsedPartyCard({
  rank,
  oftenUsedParty,
  allStudents,
  recruitedStudentTiers,
  showUnrecruitedStudents,
  cardClassName,
  summaryClassName,
  ranksPath,
}: {
  rank: number;
  oftenUsedParty: RaidOftenUsedParty;
  allStudents: RaidOftenUsedPartiesProps["allStudents"];
  recruitedStudentTiers: RaidOftenUsedPartiesProps["recruitedStudentTiers"];
  showUnrecruitedStudents: boolean;
  cardClassName?: string;
  summaryClassName?: string;
  ranksPath?: string;
}) {
  const rows = oftenUsedParty.parties.map((party, partyIndex) =>
    toRaidPartyRow({
      party,
      partyIndex,
      allStudents,
      recruitedStudentTiers,
      showUnrecruitedStudents,
    }),
  );
  const summaryItems = [
    {
      label: "최고 순위",
      value: `${oftenUsedParty.maxRank.toLocaleString()}위`,
    },
    {
      label: "최고 점수",
      value: `${oftenUsedParty.maxScore.toLocaleString()}점`,
    },
  ];
  const exactParties = compactExactParties(
    oftenUsedParty.parties.map((party) => party.students.map((slot) => slot.student?.uid)),
  );
  const exactRanksPath = ranksPath && exactParties.length > 0 ? buildExactPartiesPath(ranksPath, exactParties) : null;

  return (
    <RaidPartyCard
      primaryLabel={`${rank}위`}
      secondaryLabel={`${oftenUsedParty.count.toLocaleString()}회`}
      rows={rows}
      summaryItems={summaryItems}
      actions={
        exactRanksPath ? (
          <Button text="이 편성 순위 보기" to={exactRanksPath} icon={TrophyIcon} size="xs" className="shadow-xs" />
        ) : undefined
      }
      popupIdPrefix={`often-used-${rank}`}
      visibleRowCount={VISIBLE_PARTY_COUNT}
      className={cardClassName}
      summaryClassName={summaryClassName}
      getStudentActions={(slot) =>
        slot.uid
          ? [
              {
                Icon: IdentificationIcon,
                text: "학생부 보기",
                link: `/students/${slot.uid}`,
              },
            ]
          : []
      }
    />
  );
}

function toRaidPartyRow({
  party,
  partyIndex,
  allStudents,
  recruitedStudentTiers,
  showUnrecruitedStudents,
}: {
  party: Party;
  partyIndex: number;
  allStudents: RaidOftenUsedPartiesProps["allStudents"];
  recruitedStudentTiers: RaidOftenUsedPartiesProps["recruitedStudentTiers"];
  showUnrecruitedStudents: boolean;
}): RaidPartyRow {
  const key = `${partyIndex}-${party.students.map((slot) => slot.student?.uid ?? slot.slot).join("-")}`;

  return {
    key,
    label: `${partyIndex + 1}편성`,
    slots: party.students.map((slot) =>
      toRaidPartySlot({
        slot,
        allStudents,
        recruitedStudentTiers,
        showUnrecruitedStudents,
      }),
    ),
  };
}

function toRaidPartySlot({
  slot,
  allStudents,
  recruitedStudentTiers,
  showUnrecruitedStudents,
}: {
  slot: ServerStudentSlot;
  allStudents: RaidOftenUsedPartiesProps["allStudents"];
  recruitedStudentTiers: RaidOftenUsedPartiesProps["recruitedStudentTiers"];
  showUnrecruitedStudents: boolean;
}): RaidPartySlot {
  if (slot.slot === "empty" || !slot.student) {
    return { uid: null };
  }

  const student = allStudents[slot.student.uid];
  const isUnrecruited = showUnrecruitedStudents && recruitedStudentTiers[slot.student.uid] === undefined;

  return {
    uid: slot.student.uid,
    name: student?.name,
    attackType: student?.attackType,
    defenseType: student?.defenseType,
    role: student?.role,
    tier: slot.student.tier,
    isAssist: slot.student.isAssist,
    grayscale: isUnrecruited,
    unrecruited: isUnrecruited,
  };
}

function getOftenUsedPartyKey({ maxRank, maxScore, parties }: RaidOftenUsedParty, index: number): string {
  const representativeParty = parties[0];
  const representativeKey = representativeParty?.students.map((slot) => slot.student?.uid ?? slot.slot).join("-");

  return `${maxRank}-${maxScore}-${representativeKey ?? index}`;
}
