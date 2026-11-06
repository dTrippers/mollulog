import type { Attack } from "~/graphql/graphql";

type StudentSkillIconProps = {
  attackType: Attack;
  iconUrl: string | null;
  muted?: boolean;
  size?: "sm" | "md";
};

const attackColor: Record<Attack, string> = {
  explosive: "text-v2-attr-red",
  piercing: "text-v2-attr-yellow",
  mystic: "text-v2-attr-blue",
  sonic: "text-v2-attr-purple",
  chemical: "text-v2-attr-green",
  normal: "text-v2-attr-grey",
};

export function StudentSkillIcon({ attackType, iconUrl, muted = false, size = "md" }: StudentSkillIconProps) {
  return (
    <span className={`relative flex items-center justify-center justify-self-center ${size === "sm" ? "size-10" : "size-12"}`}>
      <svg viewBox="0 0 41.569 48" className={`absolute inset-0 size-full ${attackColor[attackType]} ${muted ? "opacity-60" : ""}`} aria-hidden="true">
        <path
          fill="currentColor"
          d="M18.211 1.5 Q20.785 0 23.358 1.5 L38.996 10.5 Q41.569 12 41.569 15 L41.569 33 Q41.569 36 38.996 37.5 L23.358 46.5 Q20.785 48 18.211 46.5 L2.573 37.5 Q0 36 0 33 L0 15 Q0 12 2.573 10.5 Z"
        />
      </svg>
      {iconUrl ? <img src={iconUrl} alt="" className={`relative z-10 object-contain ${size === "sm" ? "size-10" : "size-12"}`} /> : null}
    </span>
  );
}
