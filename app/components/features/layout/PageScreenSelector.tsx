import { Link } from "react-router";
import { cn } from "~/lib/utils";

export type PageScreenSelectorProps = {
  screens: PageScreenSelectorItemProps[];
};

export type PageScreenSelectorItemProps = {
  text: string;
  label?: string;
  description?: string;
  Icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  link?: string;
};

export default function PageScreenSelector({ screens }: PageScreenSelectorProps) {
  return (
    <div className="hidden space-y-2 py-4 lg:block">
      {screens.map((screen) => (
        <PageScreenSelectorItem key={screen.link ?? screen.text} {...screen} />
      ))}
    </div>
  );
}

function PageScreenSelectorItem({
  text,
  label,
  description,
  Icon,
  active,
  disabled,
  onClick,
  link,
}: PageScreenSelectorItemProps) {
  const className = cn(
    "flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    disabled && "cursor-not-allowed bg-muted/40 text-muted-foreground opacity-60",
    active && !disabled && "bg-primary/10 text-primary",
    !active && !disabled && "bg-card text-foreground hover:bg-muted",
  );
  const content = (
    <>
      <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} strokeWidth={2} />
      <div className="grow">
        <p className="text-sm font-semibold">{text}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {label ? (
        <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-bold leading-none text-white">
          {label}
        </span>
      ) : null}
    </>
  );

  if (!disabled && link) {
    return (
      <Link to={link} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
    >
      {content}
    </button>
  );
}
