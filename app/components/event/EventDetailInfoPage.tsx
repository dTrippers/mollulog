import { ClockIcon, ExclamationTriangleIcon, StarIcon, XCircleIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { useEffect, useMemo, useState, useRef } from "react";
import { useFetcher } from "react-router";
import type { PickupType, AttackType, DefenseType, Role, EventType } from "~/models/content.d";
import EventPickup from "./EventPickup";
import { SubTitle } from "../atoms/typography";
import ContentCommentEditor from "../contents/ContentCommentEditor";
import type { ActionData as CommentActionData } from "~/routes/api.contents.$uid.comments";
import EventInfoCard from "./EventInfoCard";

type EventDetailInfoPageProps = {
  event: {
    uid: string;
    type: EventType;
    since: Date;
    until: Date;
  }
  pickups: {
    type: PickupType;
    rerun: boolean;
    since: Date;
    until: Date | null;
    student: {
      uid: string;
      attackType: AttackType;
      defenseType: DefenseType;
      role: Role;
    } | null;
    studentName: string;

    favoritedCount: number;
    favorited: boolean;
  }[];

  allComments: {
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

  me: {
    username: string;
  } | null;
};

export type ActionData = {
  favorite?: {
    studentUid: string;
    favorited: boolean;
  };
  memo?: {
    body: string;
    visibility: "private" | "public";
  };
};

export default function EventDetailInfoPage({ event, pickups, allComments, me }: EventDetailInfoPageProps) {
  return (
    <div>
      {event.type === "fes" && (
        <>
          <EventInfoCard
            Icon={StarIcon}
            title="모집 확률 상승"
            description="★3 학생 모집 확률이 6%로 상승해요"
          />
          <EventInfoCard
            Icon={ClockIcon}
            title="기간 한정 모집"
            description={"\"페스 신규/복각\" 학생은 페스 기간에만 모집할 수 있어요"}
          />
          
        </>
      )}

      {pickups.length > 0 && <Pickups pickups={pickups} signedIn={me !== null} event={event} />}
      <EventComment allComments={allComments} me={me} eventUid={event.uid} />
    </div>
  )
}

type PickupsProps = {
  pickups: EventDetailInfoPageProps["pickups"];
  signedIn: boolean;
  event: {
    uid: string;
    type: EventType;
    since: Date;
    until: Date;
  };
};

function Pickups({ pickups, signedIn, event }: PickupsProps) {
  const pickupDateGroupsArray = useMemo(() => {
    const pickupDateGroups = pickups.reduce((groups, pickup) => {
      const key = `${pickup.since}-${pickup.until}`;
      if (!groups[key]) {
        groups[key] = {
          since: pickup.since,
          until: pickup.until,
          pickups: []
        };
      }
      groups[key].pickups.push(pickup);
      return groups;
    }, {} as Record<string, { since: Date; until: Date | null; pickups: typeof pickups }>);

    return Object.values(pickupDateGroups);
  }, [event.uid]);

  const hasMultipleDateRanges = pickupDateGroupsArray.length > 1;
  // Check if any pickup group has different dates from event
  const shouldNotifyPickupPeriod = pickups.length > 0 && pickupDateGroupsArray.some(group => {
    const isSinceDifferent = !dayjs(group.since).isSame(dayjs(event.since), "day");
    const isUntilDifferent = !dayjs(group.until).isSame(dayjs(event.until), "day");
    return group.until !== null && (isSinceDifferent || isUntilDifferent);
  });

  const [filteredPickups, nonPickups] = useMemo(() => {
    if (event.type !== "fes") {
      return [pickups, []];
    }

    const filteredPickups: typeof pickups = [];
    const nonPickups: typeof pickups = [];
    pickups.forEach((pickup) => {
      if ((pickup.type === "fes" && !pickup.rerun) || (pickup.type === "limited" && pickup.rerun)) {
        filteredPickups.push(pickup);
      } else {
        nonPickups.push(pickup);
      }
    });
    return [filteredPickups, nonPickups];
  }, [pickups]);

  return (
    <>
      <SubTitle text="픽업 모집 학생" />
      {shouldNotifyPickupPeriod && (
        <div className="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-amber-700 dark:text-amber-300 mb-1">
                이벤트 개최 기간과 픽업 모집 기간이 달라요
              </p>
              <div className="text-sm text-amber-600 dark:text-amber-400">
                {hasMultipleDateRanges ? (
                  <>
                    {pickupDateGroupsArray.map((group, index) => {
                      const studentNames = group.pickups.map(pickup => pickup.studentName).join(", ");
                      const isSinceDifferent = !dayjs(group.since).isSame(dayjs(event.since), "day");
                      const isUntilDifferent = !dayjs(group.until).isSame(dayjs(event.until), "day");

                      return (
                        <span key={`group-${index}`}>
                          {studentNames}의 픽업은&nbsp;
                          <span className={isSinceDifferent ? "font-semibold" : ""}>{dayjs(group.since).format("M월 D일")}</span>부터&nbsp;
                          <span className={isUntilDifferent ? "font-semibold" : ""}>{dayjs(group.until).format("M월 D일")}</span>까지
                          {index < pickupDateGroupsArray.length - 1 ? ", " : " "}
                        </span>
                      );
                    })}
                    진행해요.
                  </>
                ) : (
                  <>
                    픽업 모집은&nbsp;
                    <span className={!dayjs(pickupDateGroupsArray[0].since).isSame(dayjs(event.since), "day") ? "font-semibold" : ""}>{dayjs(pickupDateGroupsArray[0].since).format("M월 D일")}</span>부터&nbsp;
                    <span className={!dayjs(pickupDateGroupsArray[0].until).isSame(dayjs(event.until), "day") ? "font-semibold" : ""}>{dayjs(pickupDateGroupsArray[0].until).format("M월 D일")}</span>까지 진행해요.
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {filteredPickups.map((pickup) => <EventPickupWithFavoriteState key={pickup.student?.uid} pickup={pickup} signedIn={signedIn} />)}

      {nonPickups.length > 0 && (
        <>
          <SubTitle text="기간 한정 모집 학생" />
          <EventInfoCard
            Icon={XCircleIcon}
            title="모집 포인트(천장) 교환 불가"
            description="아래 학생들은 모집 포인트(천장)로는 교환할 수 없어요"
          />
          {nonPickups.map((pickup) => <EventPickupWithFavoriteState key={pickup.student?.uid} pickup={pickup} signedIn={signedIn} />)}
        </>
      )}
    </>
  );
}

type EventPickupWithFavoriteStateProps = {
  pickup: EventDetailInfoPageProps["pickups"][0];
  signedIn: boolean;
}

function EventPickupWithFavoriteState({ pickup, signedIn }: EventPickupWithFavoriteStateProps) {
  const [favorited, setFavorited] = useState(pickup.favorited);
  const [favoritedCount, setFavoritedCount] = useState(pickup.favoritedCount);

  const fetcher = useFetcher();
  const submit = (data: ActionData) => fetcher.submit(data, { method: "post", encType: "application/json" });
  const toggleFavorite = (favorited: boolean) => {
    submit({ favorite: { studentUid: pickup.student?.uid ?? "", favorited } });
    setFavorited(favorited);
    setFavoritedCount(favoritedCount + (favorited ? 1 : -1));
  };

  return (
    <EventPickup
      pickup={pickup}
      favorited={favorited}
      favoritedCount={favoritedCount}
      onFavorite={toggleFavorite}
      signedIn={signedIn}
    />
  );
}

type EventCommentProps = {
  allComments: EventDetailInfoPageProps["allComments"];
  me: EventDetailInfoPageProps["me"];
  eventUid: string;
};

function EventComment({ allComments: initialComments, me, eventUid }: EventCommentProps) {
  const [allComments, setAllComments] = useState(initialComments);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const justUpdatedRef = useRef(false);

  const fetcher = useFetcher();
  const submit = (data: CommentActionData) => {
    setHasPendingUpdate(true);
    justUpdatedRef.current = false;
    fetcher.submit(data, { action: `/api/contents/${eventUid}/comments`, method: "post", encType: "application/json" });
  };

  // Update comments state when action completes and returns updated comments
  useEffect(() => {
    if ((fetcher.state === "loading" || fetcher.state === "idle") && hasPendingUpdate && fetcher.data && Array.isArray(fetcher.data)) {
      setAllComments(fetcher.data);
      justUpdatedRef.current = true;
      setHasPendingUpdate(false);
    }
  }, [fetcher.state, fetcher.data, hasPendingUpdate]);

  // Sync with initial comments when they change (but not if we just updated from action)
  useEffect(() => {
    if (!hasPendingUpdate && !justUpdatedRef.current) {
      setAllComments(initialComments);
    }
    // Reset the flag after checking
    justUpdatedRef.current = false;
  }, [initialComments, hasPendingUpdate]);

  return (
    <>
      <SubTitle text="이벤트 의견" />
      <ContentCommentEditor
        comments={allComments}
        onCreateComment={(body, visibility) => submit({ action: "create", body, visibility })}
        onCreateSubcomment={(parentCommentId, body, visibility) => submit({ action: "createSubcomment", parentCommentId, body, visibility })}
        onUpdateComment={(commentUid, body, visibility) => submit({ action: "update", commentUid, body, visibility })}
        onDeleteComment={(commentUid) => submit({ action: "delete", commentUid })}
        signedIn={me !== null}
        isSubmitting={fetcher.state === "submitting"}
      />
    </>
  );
}
