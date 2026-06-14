import type { ElementType, MouseEvent, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";

type PrimitiveButtonProps = {
  text?: string;
  children?: ReactNode | ReactNode[];
  icon?: ElementType;
  className?: string;
  type?: "button" | "submit" | "reset";
  variant?: "default" | "primary" | "danger" | "inverse" | "tint" | "tint-blue" | "tint-red" | "list";
  size?: "md" | "sm" | "xs" | "list";
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  form?: string;
  fullWidth?: boolean;
  shadow?: "auto" | "xs" | "none";
  href?: string;
  to?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
};

export default function PrimitiveButton({
  text,
  children,
  icon: Icon,
  className,
  type = "button",
  variant = "default",
  size = "md",
  onClick,
  disabled = false,
  name,
  value,
  form,
  fullWidth = false,
  shadow = "auto",
  href,
  to,
  target,
  rel,
}: PrimitiveButtonProps) {
  const variantClass = {
    default: "border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
    primary: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
    danger: "border-transparent bg-destructive text-white hover:bg-destructive/90",
    inverse: "border-transparent bg-foreground text-background hover:opacity-90",
    tint: "border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
    "tint-blue": "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300",
    "tint-red": "border-red-500/20 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300",
    list: "border-transparent bg-transparent shadow-none hover:bg-muted",
  }[variant];

  const sizeClass = {
    md: "px-4 py-1.5 rounded-md text-sm",
    sm: "px-3 py-1.5 rounded-md text-sm",
    xs: "px-2 py-1 rounded-sm text-xs font-medium whitespace-nowrap",
    list: "w-full min-h-12 p-4 rounded-md text-sm",
  }[size];

  const justifyClass = size === "list" ? "justify-start text-left" : "justify-center text-center";
  const widthClass = fullWidth ? "w-full" : "w-fit";
  const shadowClass = shadow === "none" ? "" : shadow === "xs" ? "shadow-xs" : variant === "list" || size === "xs" ? "" : "shadow-xs";
  const buttonClassName = cn(
    "inline-flex cursor-pointer items-center gap-2 border font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
    widthClass,
    justifyClass,
    sizeClass,
    variantClass,
    shadowClass,
    className,
  );

  const content =
    children ??
    (Icon ? (
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" strokeWidth={2} />
        <span>{text}</span>
      </div>
    ) : (
      text
    ));

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
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
      <Link to={to} className={buttonClassName} onClick={handleClick} aria-disabled={disabled}>
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
      name={name}
      value={value}
      form={form}
    >
      {content}
    </button>
  );
}

export type { PrimitiveButtonProps };
