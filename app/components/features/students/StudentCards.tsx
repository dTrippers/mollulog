import type { ReactNode } from "react";
import type { Role } from "~/models/content.d";
import type { Attack, Defense } from "~/graphql/graphql";
import StudentCard from "./StudentCard";

type StudentCardsProps = {
  students?: {
    uid: string | null;
    name?: string | null;
    attackType?: Attack;
    defenseType?: Defense;
    role?: Role;
    schaleDbId?: string | null;

    tier?: number | null;
    level?: number | null;
    label?: ReactNode;
    grayscale?: boolean;
    hideName?: boolean;

    state?: {
      favorited?: boolean;
      favoritedCount?: number;
    };
  }[];
  mobileGrid?: 4 | 5 | 6 | 8;
  pcGrid?: 4 | 6 | 8 | 10 | 12;
  layout?: "grid" | "wrap";
  cardSize?: "xs" | "sm" | "md" | "lg";
  gap?: "normal" | "tight";
  onSelect?: (uid: string) => void;
  onRef?: (uid: string, ref: HTMLDivElement | null) => void;
};

export default function StudentCards({
  students,
  mobileGrid,
  pcGrid,
  layout = "grid",
  cardSize = "md",
  gap = "normal",
  onSelect,
  onRef,
}: StudentCardsProps) {
  let gridClass = "grid-cols-6";
  if (mobileGrid === 8) {
    gridClass = "grid-cols-8";
  } else if (mobileGrid === 5) {
    gridClass = "grid-cols-5";
  } else if (mobileGrid === 4) {
    gridClass = "grid-cols-4";
  }

  let pcGridClass = "md:grid-cols-8"
  if (pcGrid === 4) {
    pcGridClass = "md:grid-cols-4";
  } else if (pcGrid === 6) {
    pcGridClass = "md:grid-cols-6";
  } else if (pcGrid === 10) {
    pcGridClass = "md:grid-cols-10";
  } else if (pcGrid === 12) {
    pcGridClass = "md:grid-cols-12";
  }

  const gapClass = gap === "tight" ? "gap-1" : "gap-1 sm:gap-2";
  const wrapGapClass = gap === "tight" ? "gap-x-1.5 gap-y-2" : "gap-x-2 gap-y-3";
  const wrapCardSizeClass = {
    xs: "w-10 sm:w-12",
    sm: "w-12 sm:w-14",
    md: "w-14 sm:w-16",
    lg: "w-16 sm:w-20",
  }[cardSize];
  const containerClassName = layout === "wrap"
    ? `relative flex flex-wrap items-start ${wrapGapClass}`
    : `relative grid ${gridClass} ${pcGridClass} ${gapClass}`;
  const itemClassName = layout === "wrap"
    ? `scroll-mt-20 md:scroll-mt-4 shrink-0 ${wrapCardSizeClass}`
    : "scroll-mt-20 md:scroll-mt-4";

  return (
    <div className={containerClassName}>
      {students?.map((student, index) => {
        const { uid } = student;
        return (
          <div
            key={`student-card-${student.name ?? uid}-${index}`}
            ref={(ref) => {
              if (uid) {
                onRef?.(uid, ref);
              }
            }}
            className={itemClassName}
          >
            <StudentCard
              {...student}
              favorited={student.state?.favorited}
              favoritedCount={student.state?.favoritedCount}
              onSelect={onSelect}
            />
          </div>
        );
      })}
    </div>
  );
}
