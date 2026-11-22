import { ClockIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { WalkthroughTimelineRecord } from "~/domain/walkthrough-timeline";
import { formatInstant } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { bossImageUrl } from "~/models/assets";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { WalkthroughConditions } from "./WalkthroughConditions";
import { WalkthroughLikeButton } from "./WalkthroughEngagement";

export type WalkthroughListCardParty = {
  uid: string;
  studentUids: string[];
  hasTimeline: boolean;
};

export type WalkthroughListCardData = Pick<
  WalkthroughTimelineRecord,
  "uid" | "title" | "bossUid" | "terrain" | "defenseType" | "maxDifficulty" | "isAuto" | "visibility"
> & {
  updatedAt: string | Date;
  excerpt: string;
  parties: WalkthroughListCardParty[];
};

const visibilityLabel = { unlisted: "목록 미노출", private: "나만 보기" } as const;

// A guide in the list: boss, title, conditions, the first lines of the body, each party's faces, author, and likes. The
// whole card opens the guide; the like button stays its own control above that link.
export function WalkthroughListCard({
  guide,
  bossName,
  author,
  studentName,
  isUnrecruited,
  engagement,
  signedIn,
  canLike,
  demo = false,
}: {
  guide: WalkthroughListCardData;
  bossName: string | null;
  author: string | null;
  studentName: (uid: string) => string;
  isUnrecruited: (uid: string) => boolean;
  engagement: { liked: boolean; likeCount: number };
  signedIn: boolean;
  canLike: boolean;
  demo?: boolean;
}) {
  const timeZone = useDisplayTimeZone();
  return (
    <article className="relative isolate flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-lg bg-v2-surface p-v2-block-p">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 -z-10 h-20 w-1/2 bg-cover bg-center opacity-50 [mask-image:linear-gradient(to_right,transparent,black_60%),linear-gradient(to_bottom,black_40%,transparent)] [mask-composite:intersect]"
        style={{ backgroundImage: `url(${bossImageUrl(guide.bossUid)})` }}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs text-v2-fg-secondary">{bossName ?? "보스 정보 확인 불가"}</p>
        <h2 className="text-base font-bold text-v2-fg">
          <Link
            to={`/timelines/${guide.uid}`}
            className="line-clamp-2 outline-none after:absolute after:inset-0 after:z-[1] after:rounded-lg after:content-[''] hover:after:bg-v2-hover focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-v2-focus after:v2-interaction-transition"
          >
            {guide.title}
          </Link>
        </h2>
      </div>
      <WalkthroughConditions timeline={guide} />
      {guide.excerpt ? <p className="line-clamp-2 text-sm text-v2-fg-secondary">{guide.excerpt}</p> : null}
      {guide.parties.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {guide.parties.map((party, index) => (
            <li key={party.uid} className="flex min-h-7 min-w-0 items-center gap-2">
              <span className="w-3.5 shrink-0 text-xs font-bold text-v2-fg-tertiary tabular-nums">{index + 1}</span>
              <span className="flex min-w-0 flex-wrap gap-1">
                {party.studentUids.map((uid) => {
                  const unrecruited = isUnrecruited(uid);
                  return (
                    <RoundStudentImage
                      // A party holds a student only once (the document parser rejects duplicates).
                      key={uid}
                      studentUid={uid}
                      size="sm"
                      alt={unrecruited ? `${studentName(uid)} (미모집)` : studentName(uid)}
                      className={cn(unrecruited && "opacity-50 grayscale")}
                    />
                  );
                })}
              </span>
              {party.hasTimeline ? (
                <span className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-v2-inset px-2 text-xs text-v2-fg-secondary">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  타임라인
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-auto flex min-h-7 items-center gap-x-3 gap-y-1 pt-1 text-xs text-v2-fg-secondary">
        {demo ? <span>몰루로그</span> : author ? <span className="min-w-0 truncate">@{author}</span> : null}
        {demo ? (
          <span className="rounded-full bg-v2-inset px-2 py-0.5">예시</span>
        ) : (
          <time dateTime={new Date(guide.updatedAt).toISOString()} className="tabular-nums">
            {formatInstant(guide.updatedAt, { timeZone, format: "YYYY/MM/DD" })}
          </time>
        )}
        {guide.visibility !== "public" ? (
          <span className="rounded-full bg-v2-inset px-2 py-0.5">{visibilityLabel[guide.visibility]}</span>
        ) : null}
        {!demo && guide.visibility === "public" ? (
          <WalkthroughLikeButton
            timelineUid={guide.uid}
            liked={engagement.liked}
            likeCount={engagement.likeCount}
            signedIn={signedIn}
            canLike={canLike}
            variant="text"
            className="relative z-10 -mr-2 ml-auto"
          />
        ) : null}
      </div>
    </article>
  );
}
