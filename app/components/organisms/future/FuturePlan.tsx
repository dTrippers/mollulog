import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { Link } from "react-router";
import dayjs from "dayjs";
import { ChatBubbleOvalLeftEllipsisIcon, ChevronRightIcon } from "@heroicons/react/16/solid";
import { MultilineText } from "~/components/atoms/typography";
import { OptionBadge, StudentCard } from "~/components/atoms/student";
import { ResourceCards } from "~/components/molecules/student";
import { attackTypeColor, attackTypeLocale, defenseTypeColor, defenseTypeLocale, pickupLabelLocale, roleColor, roleLocale, schoolNameLocale } from "~/locales/ko";
import type { AttackType, DefenseType, PickupType, Role } from "~/models/content.d";
import ContentCommentView from "~/components/contents/ContentCommentView";
import ContentCommentEditor from "~/components/contents/ContentCommentEditor";
import { BottomSheet } from "~/components/atoms/layout";
import type { ActionData as CommentActionData } from "~/routes/api.contents.$uid.comments";

type FuturePlanStudents = {
  uid: string;
  name: string;
  school: string;
  attackType: AttackType;
  defenseType: DefenseType;
  role: Role;
  schaleDbId: string | null;
  equipments: string[];
  skillItems: {
    item: {
      uid: string;
      subCategory: string | null;
      rarity: number;
    };
  }[];
};

type FuturePlanProps = {
  event: {
    uid: string;
    name: string;
    since: Date;
    until: Date;
    pickups: {
      type: PickupType;
      rerun: boolean;
      student: FuturePlanStudents | null;
    }[];
  };
  favoritedStudents: {
    studentId: string;
  }[];
  comments?: {
    uid: string;
    body: string;
    visibility: "private" | "public";
    pinned?: boolean;
    createdAt: string;
    sensei: {
      me: boolean;
      username: string;
      profileStudentId: string | null;
    };
    subcomments?: {
      uid: string;
      body: string;
      visibility: "private" | "public";
      createdAt: string;
      sensei: {
        me: boolean;
        username: string;
        profileStudentId: string | null;
      };
    }[];
  }[];
  isMe: boolean;
};

export default function FuturePlan({ event, favoritedStudents, comments, isMe }: FuturePlanProps) {
  const [allComments, setAllComments] = useState(comments ?? []);
  const [commentEditing, setCommentEditing] = useState(false);
  const fetcher = useFetcher();

  // Update comments when fetcher returns data
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && Array.isArray(fetcher.data)) {
      setAllComments(fetcher.data);
    }
  }, [fetcher.state, fetcher.data]);

  // Sync with initial comments when they change
  useEffect(() => {
    if (fetcher.state === "idle") {
      setAllComments(comments ?? []);
    }
  }, [comments, fetcher.state]);

  const submit = (data: CommentActionData) => {
    fetcher.submit(data, { action: `/api/contents/${event.uid}/comments`, method: "post", encType: "application/json" });
  };

  // Find pinned comment UID
  const pinnedCommentUid = allComments.find((c) => c.pinned)?.uid ?? null;

  if (favoritedStudents.length === 0) {
    return null;
  }

  // Assert non-null for `student`
  const favoritedPickups: {
    student: FuturePlanStudents;
    type: PickupType;
    rerun: boolean;
  }[] = event.pickups.filter(({ student }) => favoritedStudents.some(({ studentId }) => studentId === student?.uid)).map(({ student, ...rest }) => ({
    student: student!,
    ...rest,
  }));

  const since = dayjs(event.since);
  const until = dayjs(event.until);
  const dDay = since.startOf("day").diff(dayjs().startOf("day"), "day");

  // Group resources by student instead of aggregating
  const studentResources: Record<string, {
    equipments: string[];
    mainSkillItems: string[];
    subSkillItems: string[];
  }> = {};

  favoritedPickups.forEach(({ student }) => {
    if (!studentResources[student.uid]) {
      studentResources[student.uid] = {
        equipments: [],
        mainSkillItems: [],
        subSkillItems: [],
      };
    }

    if (student.equipments) {
      studentResources[student.uid].equipments.push(...student.equipments);
    }

    if (student.skillItems) {
      student.skillItems.filter(({ item }) => item.subCategory === "artifact").forEach(({ item }) => {
        if (item.rarity === 4) {
          studentResources[student.uid].mainSkillItems.push(item.uid);
        } else {
          studentResources[student.uid].subSkillItems.push(item.uid);
        }
      });
    }
  });

  return (
    <div className="my-4 p-3 md:p-4 bg-neutral-100 dark:bg-neutral-900 rounded-lg">
      {/* Title */}
      <div className="px-1 py-2 mb-2 flex items-begin justify-between gap-4">
        <div className="grow">
          <Link to={`/events/${event.uid}`} className="hover:underline">
            <MultilineText className="text-lg md:text-xl font-bold leading-snug" texts={event.name.split("\n")} />
          </Link>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{since.format("YYYY-MM-DD")} ~ {until.format("YYYY-MM-DD")}</p>
        </div>
        {dDay > 0 && (
          <div className="shrink-0">
            <div className="inline-flex items-center justify-center rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1">
              <p className="text-base font-bold">D-{dDay}</p>
            </div>
          </div>
        )}
      </div>

      {/* Students */}
      <div className="px-3 md:px-4 py-4 grow bg-white dark:bg-neutral-800 rounded-lg">
        {/* Display each student with their info and resources */}
        {favoritedPickups.map(({ student, type, rerun }) => {
          const resources = studentResources[student.uid];
          const hasEquipments = resources?.equipments.length > 0;
          const hasOoparts = resources?.mainSkillItems.length > 0 || resources?.subSkillItems.length > 0;

          return (
            <div key={student.uid} className="mb-6 last:mb-0">
              {/* Student Info */}
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 md:w-16">
                  <StudentCard
                    uid={student.uid}
                    attackType={student.attackType}
                    defenseType={student.defenseType}
                    role={student.role}
                  />
                </div>

                <div className="flex-grow">
                  <Link to={`/students/${student.uid}`} className="text-lg font-bold hover:underline flex items-center gap-1">
                    <p>{student.name}</p>
                    <ChevronRightIcon className="size-4 inline" />
                  </Link>

                  <div className="mb-2">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {pickupLabelLocale({ type, rerun })} &middot; {schoolNameLocale[student.school]}
                    </p>
                    <div className="py-2 flex text-sm gap-x-1">
                      <OptionBadge text={attackTypeLocale[student.attackType]} color={attackTypeColor[student.attackType]} bgColor="light" />
                      <OptionBadge text={defenseTypeLocale[student.defenseType]} color={defenseTypeColor[student.defenseType]} bgColor="light"/>
                      <OptionBadge text={roleLocale[student.role]} color={roleColor[student.role]} bgColor="light"/>
                    </div>
                  </div>

                  {(hasEquipments || hasOoparts) && (
                    <ResourceCards
                      mobileGrid={5}
                      cardProps={[
                        ...resources.equipments.map((equipment) => ({
                          id: `equipment-${student.uid}-${equipment}`,
                          imageUrl: `https://assets.mollulog.net/assets/images/equipments/${equipment}`,
                        })),
                        ...resources.mainSkillItems.map((itemUid) => ({
                          id: `skillItem-${student.uid}-${itemUid}`,
                          itemUid,
                          backgroundColor: "purple" as const,
                        })),
                        ...resources.subSkillItems.map((itemUid) => ({
                          id: `skillItem-${student.uid}-${itemUid}`,
                          itemUid,
                          backgroundColor: "orange" as const,
                        })),
                      ]}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comment */}
      <div className="mt-2">
        <ContentCommentView
          comments={allComments}
          pinnedCommentUid={pinnedCommentUid ?? undefined}
          placeholder="남긴 의견이 없어요"
        />
      </div>
    </div>
  ); 
}
