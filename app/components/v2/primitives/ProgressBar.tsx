import { cn } from "~/lib/utils";

export type ProgressBarProps = {
  value: number;
  max: number;
  // Accessible name. The visible value text belongs to the parent, so the bar and its text stay one line.
  label: string;
  tone?: "default" | "warning" | "danger";
  // The track turns danger-subtle when a quota is used up. The fill stays the value's share.
  track?: "default" | "danger";
  className?: string;
};

const fillClassName = {
  default: "[&::-webkit-progress-value]:bg-v2-fg [&::-moz-progress-bar]:bg-v2-fg",
  warning: "[&::-webkit-progress-value]:bg-v2-warning [&::-moz-progress-bar]:bg-v2-warning",
  danger: "[&::-webkit-progress-value]:bg-v2-danger [&::-moz-progress-bar]:bg-v2-danger",
} as const;

// Native progress keeps the value available to assistive technology. The track is inset and the fill is a status or text tone.
export function ProgressBar({ value, max, label, tone = "default", track = "default", className }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  return (
    <progress
      value={Math.min(Math.max(value, 0), safeMax)}
      max={safeMax}
      aria-label={label}
      className={cn(
        "block h-1.5 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full",
        track === "danger" ? "bg-v2-danger-subtle" : "bg-v2-inset",
        fillClassName[tone],
        className,
      )}
    />
  );
}
