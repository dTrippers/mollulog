import dayjs from "dayjs";
import { SubTitle } from "~/components/atoms/typography";
import { raidTypeLocale, terrainLocale } from "~/locales/ko";
import type { RaidType, Terrain } from "~/models/content.d";
import type { Party } from "~/models/party"
import { useState } from "react";
import { ActionCard } from "~/components/molecules/editor";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { ProfileImage } from "~/components/atoms/student";
import { bossImageUrl } from "~/models/assets";
import { StudentCards } from "~/components/students";

type PartyViewProps = {
  party: Party;
  sensei?: {
    profileStudentId: string | null;
    username: string;
  };
  students: {
    uid: string;
    name: string;
    tier: number | null;
  }[];
  editable?: boolean;
  raids?: {
    uid: string;
    type: RaidType;
    name: string;
    boss: string;
    terrain: Terrain;
    since: Date;
  }[];
};

export default function PartyView({ party, sensei, students, editable, raids }: PartyViewProps) {
  const [memoOpened, setMemoOpened] = useState(false);
  const studentsMap = new Map(students.map((student) => [student.uid, student]));

  const raid = (raids && party.raidId) ? raids.find(({ uid }) => party.raidId === uid) : null;
  let raidText;
  if (raid) {
    raidText = [
      raidTypeLocale[raid.type],
      terrainLocale[raid.terrain],
      dayjs(raid.since).format("YYYY-MM-DD"),
    ].filter((text) => text).join(" | ");
  }

  return (
    <ActionCard actions={editable ?
      [
        { text: "편집", color: "default", link: `/my?path=parties/edit/${party.uid}` },
        { text: "삭제", color: "red", danger: true, form: { method: "post", hiddenInputs: [{ name: "uid", value: party.uid }] } },
      ] : []
    }>
      <div className="-mt-4">
        <SubTitle text={party.name} />
      </div>

      {sensei && (
        <Link className="flex items-center -mt-2 mb-4 hover:underline font-bold" to={`/@${sensei.username}`}>
          <ProfileImage imageSize={6} studentUid={sensei.profileStudentId} />
          <span className="ml-2 text-sm">@{sensei.username}</span>
        </Link>
      )}

      {raid && (
        <Link className="group flex items-center my-4 md:my-8 -mx-4 md:-mx-6" to={`/raids/${raid.uid}`}>
          <img
            className="h-12 md:h-24 w-36 md:w-fit object-cover object-left bg-linear-to-l from-white dark:from-neutral-800 rounded-r-lg"
            src={bossImageUrl(raid.boss)}
            alt={`${raid.name} 이벤트`}
          />
          <div className="px-4 md:px-6 w-full">
            <p className="font-bold group-hover:underline">
              {raid.name}
            </p>
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-300">
              {raidText}
            </p>
            {party.showAsRaidTip && (
              <p className="flex my-1 text-xs md:text-sm text-neutral-500 dark:text-neutral-300 items-center">
                <CheckCircleIcon className="mr-1 size-4 inline-block" />
                컨텐츠 공략으로 공개중
              </p>
            )}
          </div>
        </Link>
      )}

      {party.studentIds.map((squad, index) => (
        <div key={`squad-${index}`} className={index > 0 ? "mt-2 pt-2 md:pt-0 border-t border-neutral-200 md:border-0" : undefined}>
          <StudentCards
            students={squad.map((uid) => {
              if (!uid) {
                return { uid: null };
              }

              const student = studentsMap.get(uid)!;
              return { uid, name: student.name, tier: student.tier };
            })}
            mobileGrid={6}
            pcGrid={10}
          />
        </div>
      ))}

      {party.memo && (
        <div className="my-4 whitespace-pre-line text-sm md:text-base">
          {memoOpened ? (
            <>
              <p className="pb-2">{party.memo}</p>
              {party.memo.length > 100 && (
                <span className="cursor-pointer hover:underline text-neutral-500" onClick={() => setMemoOpened(false)}>
                  ... 감추기
                </span>
              )}
            </>
          ) : (
            <p>
              {party.memo.slice(0, 100)}
              {party.memo.length > 100 && (
                <span className="cursor-pointer hover:underline text-neutral-500" onClick={() => setMemoOpened(true)}>
                  ... 더보기
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </ActionCard>
  );
}
