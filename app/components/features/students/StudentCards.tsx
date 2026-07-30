import type { ReactNode } from "react";
import type { Attack, Defense } from "~/graphql/graphql";
import type { Role } from "~/models/content.d";
import StudentCard from "./StudentCard";

type StudentCardsProps = {
  students?: {
    uid: string | null;
    selectionKey?: string;
    name?: string | null;
    attackType?: Attack;
    defenseType?: Defense;
    role?: Role;
    schaleDbId?: string | null;

    tier?: number | null;
    level?: number | null;
    label?: ReactNode;
    footer?: ReactNode;
    labelPlacement?: "default" | "top-right";
    grayscale?: boolean;
    checked?: boolean;
    indeterminate?: boolean;
    selectionStyle?: "check" | "ring";
    hideName?: boolean;

    state?: {
      favorited?: boolean;
      favoritedCount?: number;
      completed?: boolean;
    };
  }[];
  mobileGrid?: 4 | 5 | 6 | 8;
  pcGrid?: 4 | 5 | 6 | 8 | 10 | 12;
  layout?: "grid" | "wrap" | "responsive-wrap";
  cardSize?: "xs" | "sm" | "md" | "lg";
  gap?: "normal" | "tight";
  namePlacement?: "below" | "overlay";
  hideNameOnMobile?: boolean;
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
  namePlacement = "below",
  hideNameOnMobile = false,
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

  let pcGridClass = "md:grid-cols-8";
  if (pcGrid === 4) {
    pcGridClass = "md:grid-cols-4";
  } else if (pcGrid === 5) {
    pcGridClass = "md:grid-cols-5";
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
  const responsiveWrapCardSizeClass = {
    xs: "sm:w-12",
    sm: "sm:w-14",
    md: "sm:w-16",
    lg: "sm:w-20",
  }[cardSize];
  const responsiveWrapGapClass = gap === "tight" ? "gap-1 sm:gap-x-1.5 sm:gap-y-2" : "gap-1 sm:gap-x-2 sm:gap-y-3";
  const containerClassName =
    layout === "wrap"
      ? `relative flex flex-wrap items-start ${wrapGapClass}`
      : layout === "responsive-wrap"
        ? `relative grid ${gridClass} ${responsiveWrapGapClass} sm:flex sm:flex-wrap sm:items-start`
        : `relative grid ${gridClass} ${pcGridClass} ${gapClass}`;
  const itemClassName =
    layout === "wrap"
      ? `scroll-mt-20 shrink-0 md:scroll-mt-4 ${wrapCardSizeClass}`
      : layout === "responsive-wrap"
        ? `scroll-mt-20 md:scroll-mt-4 sm:shrink-0 ${responsiveWrapCardSizeClass}`
        : "scroll-mt-20 md:scroll-mt-4";

  return (
    <div className={containerClassName}>
      {students?.map((student) => {
        const { uid } = student;
        const selectionKey = student.selectionKey ?? uid;
        return (
          <div
            key={`student-card-${selectionKey ?? student.name ?? "unknown"}`}
            ref={(ref) => {
              if (uid) {
                onRef?.(uid, ref);
              }
            }}
            className={itemClassName}
          >
            <StudentCard
              {...student}
              namePlacement={namePlacement}
              hideNameOnMobile={hideNameOnMobile}
              nameSize={cardSize === "xs" && namePlacement === "overlay" ? "small" : undefined}
              favorited={student.state?.favorited}
              favoritedCount={student.state?.favoritedCount}
              completed={student.state?.completed}
              onSelect={selectionKey && onSelect ? () => onSelect(selectionKey) : undefined}
            />
            {student.footer}
          </div>
        );
      })}
    </div>
  );
}
