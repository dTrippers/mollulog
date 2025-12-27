import { ClockIcon, ExclamationTriangleIcon, StarIcon, XCircleIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { useEffect, useMemo, useState, useRef } from "react";
import { useFetcher } from "react-router";
import type { AttackType, DefenseType, Role, EventType } from "~/models/content.d";
import { SubTitle } from "../atoms/typography";
import ContentCommentEditor from "../contents/ContentCommentEditor";
import type { ActionData as CommentActionData } from "~/routes/api.contents.$uid.comments";
import EventInfoCard from "./EventInfoCard";
import BattlePassInfo from "./BattlePassInfo";
import { RecruitmentTypeEnum } from "~/graphql/graphql";
import EventRecruitment from "./EventRecruitment";

type BattlePassReward = {
  normal: {
    resourceType: string;
    resourceUid: string;
    quantity: number;
  };
  growth: {
    resourceType: string;
    resourceUid: string;
    quantity: number;
  };
};

type EventDetailInfoPageProps = {
  event: {
    uid: string;
    type: EventType;
    since: Date;
    until: Date;
    tags: string[];
    endless: boolean;
  }
  recruitments: {
    recruitmentType: RecruitmentTypeEnum;
    rerun: boolean;
    pickup: boolean;
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

  battlePassRewards?: BattlePassReward[];

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

export default function EventDetailInfoPage({ event, recruitments, allComments, me, battlePassRewards }: EventDetailInfoPageProps) {
  return (
    <div>
      {event.type === "fes" && (
        <>
          <EventInfoCard
            Icon={StarIcon}
            title="모집 확률 상승"
            description="★3 학생 모집 확률이 6%로 상승해요. 단, 픽업 학생 모집 확률은 유지돼요."
          />
          <EventInfoCard
            Icon={ClockIcon}
            title="기간 한정 모집"
            description={"\"페스 신규/복각\" 학생은 페스 기간에만 모집할 수 있어요"}
          />
        </>
      )}
      {recruitments.some(({ recruitmentType }) => recruitmentType === "archive") && (
        <>
          <EventInfoCard
            Icon={StarIcon}
            title="아카이브 모집"
            description="아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 모집에서 등장하지 않아요."
          />
          <EventInfoCard
            Icon={ClockIcon}
            title="모집 포인트 유지"
            description="모집 포인트(천장)은 만료되지 않고 무기한 유지돼요."
          />
        </>
      )}
      {recruitments.some(({ recruitmentType }) => recruitmentType === "recollect") && (
        <EventInfoCard
          Icon={StarIcon}
          title="리콜렉트 모집"
          description="아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 페스 모집에서 등장하지 않아요."
        />
      )}
      {event.type === "battle_pass" && battlePassRewards && <BattlePassInfo rewards={battlePassRewards} />}
      {recruitments.length > 0 && (
        <Recruitments
          recruitments={recruitments}
          signedIn={me !== null}
          event={event}
          free100={event.tags.includes("recruit_free_100")}
        />
      )}
      <EventComment allComments={allComments} me={me} eventUid={event.uid} />
    </div>
  )
}

type RecruitmentsProps = {
  recruitments: EventDetailInfoPageProps["recruitments"];
  signedIn: boolean;
  event: {
    uid: string;
    type: EventType;
    since: Date;
    until: Date;
    endless: boolean;
  };
  free100: boolean;
};

function Recruitments({ recruitments, signedIn, event, free100 }: RecruitmentsProps) {
  const shouldNotifyPickupPeriod = useMemo(() => {
    if (event.endless) {
      return false;
    }
    const sameRecruitmentsPeriod = recruitments.every((recruitment) => {
      return dayjs(recruitment.since).isSame(dayjs(event.since), "day") && dayjs(recruitment.until).isSame(dayjs(event.until), "day");
    });
    return !sameRecruitmentsPeriod;
  }, [recruitments, event.since, event.until]);

  const filteredPickupDateGroupsArray = useMemo(() => {
    const recruitmentDateGroups = recruitments.filter(({ pickup, recruitmentType }) => pickup || recruitmentType === "given").reduce((groups, recruitment) => {
      const key = `${recruitment.since}-${recruitment.until}`;
      if (!groups[key]) {
        groups[key] = {
          since: recruitment.since,
          until: recruitment.until,
          recruitments: []
        };
      }
      groups[key].recruitments.push(recruitment);
      return groups;
    }, {} as Record<string, { since: Date; until: Date | null; recruitments: typeof recruitments }>);

    return Object.values(recruitmentDateGroups);
  }, [recruitments]);

  return (
    <>
      <SubTitle text="픽업 모집 학생" />
      {free100 && (
        <EventInfoCard
          Icon={StarIcon}
          title="총 100회 모집 무료"
          description="하루에 10~20회 씩 총 100회 무료로 학생을 모집할 수 있어요. 픽업 기간이 지나면 이용할 수 없어요."
        />
      )}
      {shouldNotifyPickupPeriod && (
        <EventInfoCard
          Icon={ExclamationTriangleIcon}
          title="이벤트 개최 기간과 픽업 모집 기간이 달라요"
          description="모집 포인트(천장)는 각 픽업 기간이 지나면 초기화돼요. 아래 일정을 확인해주세요."
          color="yellow"
        />
      )}

      {filteredPickupDateGroupsArray.map((group) => 
        <div key={`${dayjs(group.since).format("YYYY-MM-DD")}-${dayjs(group.until).format("YYYY-MM-DD")}`}>
          {(filteredPickupDateGroupsArray.length > 1 || shouldNotifyPickupPeriod) && (
            <p className="mt-6 -mb-2 font-semibold">
              {dayjs(group.since).format("M월 D일")} ~ {dayjs(group.until).format("M월 D일")}
            </p>
          )}
          {group.recruitments.map((recruitment) => <EventRecruitmentWithFavoriteState key={recruitment.student?.uid} recruitment={recruitment} signedIn={signedIn} />)}
        </div>
      )}

      {recruitments.filter(({ pickup, recruitmentType }) => !pickup && recruitmentType !== "given").length > 0 && (
        <>
          <SubTitle text="기간 한정 모집 학생" />
          <EventInfoCard
            Icon={XCircleIcon}
            title="모집 포인트(천장) 교환 불가"
            description="아래 학생들은 모집 포인트(천장)로는 교환할 수 없어요"
          />
          {recruitments.filter(({ pickup, recruitmentType }) => !pickup && recruitmentType !== "given")
            .map((recruitment) => <EventRecruitmentWithFavoriteState key={recruitment.student?.uid} recruitment={recruitment} signedIn={signedIn} />)}
        </>
      )}
    </>
  );
}

type EventRecruitmentWithFavoriteStateProps = {
  recruitment: EventDetailInfoPageProps["recruitments"][0];
  signedIn: boolean;
}

function EventRecruitmentWithFavoriteState({ recruitment, signedIn }: EventRecruitmentWithFavoriteStateProps) {
  const [favorited, setFavorited] = useState(recruitment.favorited);
  const [favoritedCount, setFavoritedCount] = useState(recruitment.favoritedCount);

  const fetcher = useFetcher();
  const submit = (data: ActionData) => fetcher.submit(data, { method: "post", encType: "application/json" });
  const toggleFavorite = (favorited: boolean) => {
    submit({ favorite: { studentUid: recruitment.student?.uid ?? "", favorited } });
    setFavorited(favorited);
    setFavoritedCount(favoritedCount + (favorited ? 1 : -1));
  };

  return (
    <EventRecruitment
      recruitment={recruitment}
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
