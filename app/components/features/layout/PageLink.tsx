import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";

export type PageLinkProps = {
  Icon: React.ElementType;
  title: string;
  shortTitle?: string;
  description: string;
  to: string;
  preventScrollReset?: boolean;
};

export default function PageLink({ Icon, title, description, to, preventScrollReset }: PageLinkProps) {
  const content = (
    <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-card px-3 py-3 shadow-sm shadow-black/5 transition-colors hover:bg-muted dark:shadow-none dark:hover:bg-foreground/10 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ArrowRightIcon className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
    </div>
  );

  if (to.startsWith("http")) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className="group block w-full">
        {content}
      </a>
    );
  }

  return (
    <Link to={to} preventScrollReset={preventScrollReset} className="group block w-full">
      {content}
    </Link>
  );
}
