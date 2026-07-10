import type { ElementType, MouseEvent, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";

type ButtonProps = {
  text?: string;
  children?: ReactNode | ReactNode[];
  icon?: ElementType;
  className?: string;
  type?: "button" | "submit" | "reset";
  variant?: "default" | "primary" | "secondary" | "danger" | "danger-subtle" | "inverse";
  size?: "md" | "sm" | "xs";
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  form?: string;
  fullWidth?: boolean;
  href?: string;
  to?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
};

export default function Button({
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
  href,
  to,
  target,
  rel,
}: ButtonProps) {
  const variantClass = {
    default: "border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
    primary: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
    danger: "border-transparent bg-destructive text-white hover:bg-destructive/90",
    inverse: "border-transparent bg-foreground text-background hover:bg-foreground/90",
    secondary: "border-transparent bg-muted text-foreground hover:bg-muted/80",
    "danger-subtle": "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
  }[variant];

  const sizeClass = {
    md: "px-4 py-1.5 rounded-md text-sm",
    sm: "px-3 py-1.5 rounded-md text-sm",
    xs: "px-2 py-1 rounded-sm text-xs font-medium whitespace-nowrap",
  }[size];

  const justifyClass = "justify-center text-center";
  const widthClass = fullWidth ? "w-full" : "w-fit";
  const shadowClass = size === "xs" ? "" : "shadow-xs";
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

export type { ButtonProps };
