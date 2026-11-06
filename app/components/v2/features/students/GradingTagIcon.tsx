import { BoltIcon, HeartIcon, StarIcon, UserGroupIcon } from "@heroicons/react/24/solid";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";

const iconByTag = {
  performance: { Icon: BoltIcon, color: "text-v2-attr-yellow" },
  universal: { Icon: UserGroupIcon, color: "text-v2-attr-green" },
  growth: { Icon: StarIcon, color: "text-v2-attr-blue" },
  love: { Icon: HeartIcon, color: "text-v2-attr-red" },
} as const;

export function GradingTagIcon({ tag, size = "md" }: { tag: StudentGradingTagValue; size?: "xs" | "sm" | "md" | "lg" }) {
  const { Icon, color } = iconByTag[tag];
  const sizeClass = size === "xs" ? "size-3" : size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-5";
  return <Icon className={`${sizeClass} ${color}`} aria-hidden="true" />;
}
