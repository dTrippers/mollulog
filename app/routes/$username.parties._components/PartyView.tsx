import dayjs from "dayjs";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Link } from "react-router";
import { ProfileImage, SubTitle } from "~/components/primitives";
import { raidTypeLocale, terrainLocale } from "~/locales/ko";
import { ActionCard } from "~/components/features/editor";
import { bossImageUrl } from "~/models/assets";
import type { RaidType } from "~/models/content.d";
import { raidTypeToParam } from "~/models/raid";
import type { Party } from "~/models/party";
import type { RaidScheduleListItem } from "~/repositories";
import { StudentCards } from "~/components/features/students";

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
  raids?: RaidScheduleListItem[];
};

export default function PartyView({ party, sensei, students, editable, raids }: PartyViewProps) {
  const [memoOpened, setMemoOpened] = useState(false);
  const studentsMap = new Map(students.map((student) => [student.uid, student]));

  const raid =
    raids && party.raidType && party.seasonIndex !== null
      ? raids.find(
          (candidate) => candidate.raidType === party.raidType && candidate.seasonIndex === party.seasonIndex,
        ) ?? null
      : null;
  let raidText = "";
  if (raid) {
    raidText = [
      raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType,
      terrainLocale[raid.terrain],
      raid.startAt ? dayjs(raid.startAt).format("YYYY-MM-DD") : null,
    ]
      .filter((text) => text)
      .join(" | ");
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
        <Link
          className="group flex items-center my-4 md:my-8 -mx-4 md:-mx-6"
          to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
        >
          <img
            className="h-12 md:h-24 w-36 md:w-fit object-cover object-left bg-linear-to-l from-white dark:from-neutral-800 rounded-r-lg"
            src={bossImageUrl(raid.raidBoss.uid)}
            alt={`${raid.raidBoss.name} 레이드`}
          />
          <div className="px-4 md:px-6 w-full">
            <p className="font-bold group-hover:underline">
              {(raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType)} {raid.raidBoss.name}
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
        <div key={squad.map((studentUid) => studentUid ?? "empty").join("-") || `empty-squad-${party.uid}-${index > 0 ? "rest" : "first"}`} className={index > 0 ? "mt-2 pt-2 md:pt-0 border-t border-neutral-200 md:border-0" : undefined}>
          <StudentCards
            students={squad.map((uid) => {
              if (!uid) {
                return { uid: null };
              }

              const student = studentsMap.get(uid);
              if (!student) {
                return { uid: null };
              }

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
                <button
                  type="button"
                  className="text-neutral-500 hover:underline"
                  onClick={() => setMemoOpened(false)}
                >
                  ... 감추기
                </button>
              )}
            </>
          ) : (
            <p>
              {party.memo.slice(0, 100)}
              {party.memo.length > 100 && (
                <button
                  type="button"
                  className="text-neutral-500 hover:underline"
                  onClick={() => setMemoOpened(true)}
                >
                  ... 더보기
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </ActionCard>
  );
}
