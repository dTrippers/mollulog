import { Link } from "react-router";
import dayjs from "dayjs";
import { ChatBubbleOvalLeftEllipsisIcon, ChevronRightIcon, LockClosedIcon, LockOpenIcon } from "@heroicons/react/16/solid";
import { MultilineText } from "~/components/atoms/typography";
import { OptionBadge, StudentCard } from "~/components/atoms/student";
import { ResourceCards } from "~/components/molecules/student";
import { attackTypeColor, attackTypeLocale, defenseTypeColor, defenseTypeLocale, pickupLabelLocale, roleColor, roleLocale, schoolNameLocale } from "~/locales/ko";
import type { AttackType, DefenseType, PickupType, Role } from "~/models/content.d";
import { useState, useEffect, useRef } from "react";

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
  const myComment = comments?.find(c => c.sensei.me);
  const [body, setBody] = useState(myComment?.body || "");
  const [visibility, setVisibility] = useState<"private" | "public">(myComment?.visibility || "private");
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save with debounce
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      if (body !== (myComment?.body || "") || visibility !== (myComment?.visibility || "private")) {
        setIsSaving(true);
        try {
          if (myComment) {
            // Update existing comment
            await fetch(`/api/contents/${event.uid}/comments`, {
              method: "POST",
              body: JSON.stringify({ action: "update", commentUid: myComment.uid, body, visibility }),
              headers: { "Content-Type": "application/json" },
            });
          } else if (body.trim()) {
            // Create new comment
            await fetch(`/api/contents/${event.uid}/comments`, {
              method: "POST",
              body: JSON.stringify({ action: "create", body, visibility }),
              headers: { "Content-Type": "application/json" },
            });
          }
        } catch (error) {
          console.error("Failed to save comment:", error);
        } finally {
          setIsSaving(false);
        }
      }
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [body, visibility, event.uid, myComment?.body, myComment?.visibility, myComment?.uid]);

  // Resize textarea on initial load
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  }, []);

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
      {isMe && (
        <div className="px-1 mt-4 -mb-2 flex items-center justify-between">
          <p className="text-lg font-bold">이벤트 댓글</p>
          {body && (
            <div
              className="flex items-center px-2 py-1 border border-neutral-300 dark:border-neutral-600 rounded text-neutral-600 dark:text-neutral-300 transition cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700"
              onClick={() => setVisibility(visibility === "private" ? "public" : "private")}
            >
              {visibility === "private" ? <LockClosedIcon className="size-3" /> : <LockOpenIcon className="size-3" />}
              <span className="ml-1 text-xs">
                {visibility === "private" ? "나만 보기" : "전체 공개"}
              </span>
            </div>
          )}
        </div>
      )}
      {(myComment?.body || isMe) && (
        <div className="mt-4 px-3 md:px-4 py-2 md:py-3 flex items-center gap-x-2 bg-white dark:bg-neutral-800 rounded-lg">
          <ChatBubbleOvalLeftEllipsisIcon className="size-4 shrink-0 text-neutral-500 dark:text-neutral-400" />
          {isMe ?
            <textarea
              ref={textareaRef}
              className="grow text-sm xl:text-base bg-transparent text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 resize-none min-h-[1.5rem] max-h-32 overflow-y-auto"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                // Auto-resize textarea
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
              }}
              placeholder="의견을 남겨보세요"
              rows={1}
              style={{ wordWrap: "break-word", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
            /> :
            <p className="text-sm xl:text-base text-neutral-500 dark:text-neutral-400">{myComment?.body}</p>
          }
          {isSaving && (
            <div className="size-3 border border-neutral-400 border-t-transparent rounded-full animate-spin shrink-0" />
          )}
        </div>
      )}
    </div>
  ); 
}
