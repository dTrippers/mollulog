import { cn } from "~/lib/utils";

const studentRows = ["first", "second", "third", "fourth"];
const resourceTiles = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

export default function ScannerJobSkeleton({ variant }: { variant: "resource" | "student" }) {
  return (
    <section aria-busy="true" aria-label="인식 작업을 불러오는 중" className="animate-pulse space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-28 rounded-sm bg-muted" />
          <div className="h-3 w-48 rounded-sm bg-muted" />
        </div>
        <div className="h-8 w-28 rounded-md bg-muted" />
      </div>

      {variant === "student" ? <StudentReviewSkeleton /> : <ResourceReviewSkeleton />}
    </section>
  );
}

function StudentReviewSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid h-12 grid-cols-[6rem_2fr_1.3fr_1.3fr_1fr] gap-px bg-border">
        {["student", "basic", "skill", "equipment", "ability"].map((key) => (
          <div key={key} className="bg-muted/70" />
        ))}
      </div>
      {studentRows.map((row) => (
        <div
          key={row}
          className="grid min-h-20 grid-cols-[6rem_2fr_1.3fr_1.3fr_1fr] gap-px border-t border-border bg-border"
        >
          <div className="flex items-center justify-center bg-card">
            <div className="size-11 rounded-md bg-muted" />
          </div>
          {["basic", "skill", "equipment", "ability"].map((group) => (
            <div key={group} className="flex items-start gap-2 bg-card p-3">
              <div className="h-9 flex-1 rounded-md bg-muted" />
              <div className={cn("h-9 flex-1 rounded-md bg-muted", group === "ability" && "hidden sm:block")} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ResourceReviewSkeleton() {
  return (
    <div className="grid min-w-0 gap-5 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
      <div className="space-y-3">
        <div className="h-4 w-32 rounded-sm bg-muted" />
        <div className="aspect-video w-full rounded-lg bg-muted" />
        <div className="flex gap-2">
          <div className="h-14 w-24 rounded-md bg-muted" />
          <div className="h-14 w-24 rounded-md bg-muted" />
          <div className="h-14 w-24 rounded-md bg-muted" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded-sm bg-muted" />
        <div className="grid grid-cols-5 gap-2">
          {resourceTiles.map((tile) => (
            <div key={tile} className="aspect-square rounded-md bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
