import { TimelineStudentImage } from "./WalkthroughTimelineViewer";

type Props = {
  partyUid: string;
  studentUids: string[];
  studentsByUid: Record<string, { name: string }>;
  label: string;
  emptyMessage: string;
};

export default function WalkthroughStartingSkillSequence({
  partyUid,
  studentUids,
  studentsByUid,
  label,
  emptyMessage,
}: Props) {
  if (studentUids.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ol className="flex max-w-full flex-wrap items-center gap-x-1 gap-y-2" aria-label={label}>
      {studentUids.map((uid, index) => {
        const student = studentsByUid[uid];
        return (
          <li key={`${partyUid}-starting-skill-${uid}`} className="flex min-w-0 max-w-full items-center gap-1">
            <span className="sr-only">{index + 1}번</span>
            {student ? (
              <TimelineStudentImage uid={uid} name={student.name} className="size-6 shrink-0" />
            ) : (
              <span
                role="img"
                aria-label="학생 정보 없음"
                className="max-w-28 rounded-md bg-muted px-2 py-1 text-xs leading-tight text-muted-foreground"
              >
                학생 정보 없음
              </span>
            )}
            {index < studentUids.length - 1 ? (
              <span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
