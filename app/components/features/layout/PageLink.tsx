import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";

export type PageLinkProps = {
  Icon: React.ElementType;
  title: string;
  description: string;
  to: string;
  preventScrollReset?: boolean;
};

export default function PageLink({ Icon, title, description, to, preventScrollReset }: PageLinkProps) {
  const content = (
    <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-3 transition-colors hover:bg-primary/15 md:px-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ArrowRightIcon className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
    </div>
  );

  if (to.startsWith("http")) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className="group block">
        {content}
      </a>
    );
  }

  return (
    <Link to={to} preventScrollReset={preventScrollReset} className="group block">
      {content}
    </Link>
  );
}
