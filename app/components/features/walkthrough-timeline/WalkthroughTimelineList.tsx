import { ArrowRightIcon, PlusIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { Link } from "react-router";
import Button from "~/components/primitives/Button";
import type { WalkthroughTimelineRecord } from "~/domain/walkthrough-timeline";
import { TimelineStudentImage } from "./WalkthroughTimelineViewer";

export function WalkthroughTimelineList({
  timelines,
  authorsById = {},
  showCreate = false,
}: {
  timelines: WalkthroughTimelineRecord[];
  authorsById?: Record<number, string>;
  showCreate?: boolean;
}) {
  return (
    <div className="space-y-4 py-4">
      {showCreate && <Button to="/timelines/new" icon={PlusIcon} text="새 공략 타임라인" variant="primary" />}
      {timelines.length === 0 ? (
        <div className="rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
          등록된 공략 타임라인이 없어요.
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
          {timelines.map((timeline) => {
            const usedStudentUids = [
              ...new Set(
                timeline.document.parties.flatMap((party) =>
                  party.steps.flatMap((step) =>
                    step.actions.flatMap((action) => (action.studentUid ? [action.studentUid] : [])),
                  ),
                ),
              ),
            ].slice(0, 8);
            return (
              <Link
                key={timeline.uid}
                to={`/timelines/${timeline.uid}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50 md:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold">{timeline.title}</h2>
                    {timeline.visibility !== "public" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">나만 보기</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {authorsById[timeline.userId] ? `@${authorsById[timeline.userId]} · ` : ""}
                    {timeline.document.parties.length}파티 ·{" "}
                    {timeline.document.parties.reduce((count, party) => count + party.steps.length, 0)}단계 ·{" "}
                    {dayjs(timeline.updatedAt).format("YYYY.MM.DD")}
                  </p>
                  {usedStudentUids.length > 0 && (
                    <fieldset className="mt-3 flex -space-x-1">
                      <legend className="sr-only">사용 학생</legend>
                      {usedStudentUids.map((uid) => (
                        <TimelineStudentImage key={uid} uid={uid} name="학생" className="size-8 border-2 border-card" />
                      ))}
                    </fieldset>
                  )}
                </div>
                <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
