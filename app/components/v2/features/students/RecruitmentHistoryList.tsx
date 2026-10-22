import { Link } from "react-router";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { compareInstantDesc, formatInstant, type UtcIsoString } from "~/lib/date-time";
import { uploadedImageProps } from "~/models/assets";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";

export type RecruitmentHistoryEntry = {
  uid: string;
  name: string;
  imageUrl: string | null;
  since: UtcIsoString;
  until: UtcIsoString | null;
};

export function RecruitmentHistoryList({ recruitments }: { recruitments: RecruitmentHistoryEntry[] }) {
  const timeZone = useDisplayTimeZone();
  const rows = [...recruitments].sort((a, b) => compareInstantDesc(a.since, b.since));
  if (rows.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="recruitment-history-title">
      <div className="mb-2 flex min-h-7 items-center"><h2 id="recruitment-history-title" className="text-base leading-[1.4] font-semibold text-v2-fg">모집 일정</h2></div>
      <div className="rounded-lg bg-v2-surface p-v2-block-p">
        <ul className="space-y-1">
          {rows.map((event) => {
            const startDate = formatInstant(event.since, { timeZone, format: "YYYY/MM/DD" });
            return (
              <li key={event.uid}>
                <Link
                  to={`/events/${event.uid}`}
                  {...getV2LinkTransitionProps("crossfade")}
                  className="flex min-h-v2-row-min min-w-0 items-center gap-3"
                >
                  {event.imageUrl ? <img {...uploadedImageProps(event.imageUrl, "64px")} alt="" loading="lazy" className="h-9 w-16 shrink-0 rounded-sm object-cover" /> : <span className="h-9 w-16 shrink-0 rounded-sm bg-v2-inset" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 text-sm leading-[1.43] font-medium text-v2-fg">{event.name.replace(/\s*\r?\n\s*/g, " ")}</span>
                  <time className="shrink-0 text-right text-xs leading-[1.43] text-v2-fg-tertiary tabular-nums" dateTime={event.since}>{startDate}</time>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
