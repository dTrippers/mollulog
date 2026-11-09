import type { ReactNode } from "react";
import { resourceThumbImageSrc } from "~/components/v2/features/resources/ResourceThumb";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";

// The shop calculator's section header: an 18px title, an optional description, and actions on the right.
export function ShopSectionHeader({
  id,
  title,
  description,
  actions,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold tracking-[-0.2px] text-v2-fg">
          {title}
        </h2>
        {description ? <p className="mt-1 text-[0.8125rem] text-v2-fg-tertiary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

export function ShopSection({ id, region, children }: { id: string; region: string; children: ReactNode }) {
  return (
    <section data-region={region} aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      {children}
    </section>
  );
}

// A single-choice row of options, used where the choice changes how the section reads, such as the bonus mode or
// the cost basis of a minigame.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  full = false,
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  full?: boolean;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("shrink-0 rounded-[7px] bg-v2-inset p-0.5", full ? "flex" : "inline-flex", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: The segment buttons form a named single-selection control.
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center justify-center rounded-[5px] px-2.5 text-xs whitespace-nowrap",
              full && "flex-1",
              selected
                ? "bg-v2-elevated font-semibold text-v2-fg"
                : "font-medium text-v2-fg-secondary hover:text-v2-fg",
              v2FocusRing,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// A round currency mark beside amounts. The image is zoomed so the coin fills the circle.
export function CurrencyIcon({
  uid,
  type = ResourceTypeEnum.Item,
  imageUrl,
  name,
  size = "md",
}: {
  uid: string;
  type?: ResourceTypeEnum;
  imageUrl?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
}) {
  const src = resourceThumbImageSrc(uid, type, imageUrl);
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-full bg-v2-inset align-middle",
        size === "sm" ? "size-3.5" : size === "lg" ? "size-[1.375rem]" : "size-[1.125rem]",
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name ?? ""}
          loading="lazy"
          className={cn(
            "block max-w-none object-contain",
            size === "sm" ? "-m-[3px] size-5" : size === "lg" ? "-m-1 size-[1.875rem]" : "-m-1 size-[1.625rem]",
          )}
        />
      ) : (
        <span role="img" aria-label={`${name ?? "재화"} 이미지 없음`} />
      )}
    </span>
  );
}

export function Pill({
  tone,
  children,
  className,
}: {
  tone: "success" | "danger" | "warning" | "neutral" | "accent";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.375rem] shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap",
        tone === "success" && "bg-v2-success-subtle text-v2-success",
        tone === "danger" && "bg-v2-danger-subtle text-v2-danger",
        tone === "warning" && "bg-v2-warning-subtle text-v2-fg",
        tone === "neutral" && "bg-v2-inset text-v2-fg-secondary",
        tone === "accent" && "bg-v2-accent-subtle text-v2-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

// A labeled row inside a minigame card: a 96px label column, then the control.
export function LabeledRow({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="w-24 shrink-0 text-[0.8125rem] text-v2-fg-secondary">
          {label}
        </label>
      ) : (
        <span className="w-24 shrink-0 text-[0.8125rem] text-v2-fg-secondary">{label}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function formatCount(value: number) {
  return value.toLocaleString("ko-KR");
}
