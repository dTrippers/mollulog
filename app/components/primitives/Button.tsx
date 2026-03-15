import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router";
import { sanitizeClassName } from "~/prophandlers";

type PrimitiveButtonProps = {
  text?: string;
  children?: ReactNode | ReactNode[];
  icon?: React.ElementType;
  Icon?: React.ElementType;
  className?: string;
  type?: "button" | "submit" | "reset";
  variant?: "default" | "primary" | "danger" | "inverse" | "tint" | "tint-blue" | "tint-red" | "list";
  color?: "primary" | "red" | "black";
  size?: "md" | "sm" | "xs" | "list";
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  justify?: "start" | "center";
  compact?: boolean;
  href?: string;
  to?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
};

export default function PrimitiveButton({
  text,
  children,
  icon: Icon,
  Icon: LegacyIcon,
  className,
  type = "button",
  variant = "default",
  color,
  size = "md",
  onClick,
  disabled = false,
  fullWidth = false,
  justify = "center",
  compact = false,
  href,
  to,
  target,
  rel,
}: PrimitiveButtonProps) {
  const resolvedVariant = color === "primary"
    ? "primary"
    : color === "red"
      ? "danger"
      : color === "black"
        ? "inverse"
        : variant;
  const ResolvedIcon = Icon ?? LegacyIcon;

  const variantClass = {
    default: "border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700 shadow-neutral-200 dark:shadow-neutral-900",
    primary: "bg-blue-500 enabled:hover:bg-blue-400 disabled:bg-blue-300 text-white border-transparent shadow-blue-200/60 dark:shadow-blue-950/40",
    danger: "bg-red-500 enabled:hover:bg-red-400 disabled:bg-red-300 text-white border-transparent shadow-red-200/60 dark:shadow-red-950/40",
    inverse: "bg-neutral-900 enabled:hover:bg-neutral-700 disabled:bg-neutral-500 text-white border-transparent shadow-neutral-300/40 dark:shadow-black/40",
    tint: "text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border-neutral-200 dark:border-neutral-800",
    "tint-blue": "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800",
    "tint-red": "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-red-200 dark:border-red-800",
    list: "border-transparent shadow-none hover:bg-neutral-100 dark:hover:bg-neutral-800",
  }[resolvedVariant];

  const sizeClass = {
    md: "px-4 py-1.5 rounded-lg text-sm",
    sm: "px-3 py-1 rounded-lg text-sm",
    xs: `${compact ? "px-1" : "px-2.5"} py-1 rounded-md text-xs font-medium whitespace-nowrap`,
    list: "w-full p-4 rounded-lg text-sm",
  }[size];

  const justifyClass = justify === "start" ? "justify-start text-left" : "justify-center text-center";
  const widthClass = fullWidth ? "w-full" : "w-fit";
  const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer";
  const shadowClass = variant === "list" || size === "xs" ? "" : "shadow-sm";
  const buttonClassName = sanitizeClassName(`
    inline-flex items-center border transition
    ${widthClass}
    ${justifyClass}
    ${sizeClass}
    ${variantClass}
    ${shadowClass}
    ${disabledClass}
    ${className ?? ""}
  `);
  const content = children ?? (
    Icon ? (
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0" strokeWidth={2} />
        <span>{text}</span>
      </div>
    ) : (
      text
    )
  );
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.();
  };

  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
        className={buttonClassName}
        onClick={handleClick}
        aria-disabled={disabled}
      >
        {content}
      </a>
    );
  }

  if (to) {
    return (
      <Link
        to={to}
        className={buttonClassName}
        onClick={handleClick}
        aria-disabled={disabled}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={buttonClassName}
      onClick={handleClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
}

export type { PrimitiveButtonProps };
