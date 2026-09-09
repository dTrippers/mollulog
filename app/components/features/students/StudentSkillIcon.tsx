import type { Attack } from "~/graphql/graphql";

const skillIconColorClass: Record<Attack, string> = {
  explosive: "text-red-600",
  piercing: "text-yellow-500",
  mystic: "text-blue-600",
  sonic: "text-purple-600",
  chemical: "text-green-600",
  normal: "text-neutral-600",
};

type StudentSkillIconProps = {
  attackType: Attack;
  iconUrl: string | null;
  muted?: boolean;
  size?: "sm" | "md";
};

const iconSizeClass = {
  sm: "h-10 w-[2.165rem]",
  md: "h-12 w-[2.598rem]",
} as const;

const artworkSizeClass = {
  sm: "size-10",
  md: "size-12",
} as const;

export default function StudentSkillIcon({ attackType, iconUrl, muted = false, size = "md" }: StudentSkillIconProps) {
  return (
    <div
      className={`relative flex items-center justify-center justify-self-center ${iconSizeClass[size]} ${skillIconColorClass[attackType]}`}
    >
      <svg
        viewBox="0 0 41.569 48"
        className={`absolute inset-0 size-full drop-shadow-sm ${muted ? "opacity-60" : ""}`}
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M18.211 1.5 Q20.785 0 23.358 1.5 L38.996 10.5 Q41.569 12 41.569 15 L41.569 33 Q41.569 36 38.996 37.5 L23.358 46.5 Q20.785 48 18.211 46.5 L2.573 37.5 Q0 36 0 33 L0 15 Q0 12 2.573 10.5 Z"
        />
      </svg>
      {iconUrl ? (
        <img src={iconUrl} alt="" className={`relative z-10 ${artworkSizeClass[size]} object-contain drop-shadow-sm`} />
      ) : null}
    </div>
  );
}

export type { StudentSkillIconProps };
