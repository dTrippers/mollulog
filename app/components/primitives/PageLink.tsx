import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";

export type PageLinkProps = {
  Icon: React.ElementType;
  title: string;
  description: string;
  to: string;
};

export default function PageLink({ Icon, title, description, to }: PageLinkProps) {
  const inner = (
    <div className="flex items-center justify-between px-3 md:px-4 py-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-500 text-white rounded-lg">
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{title}</p>
          <p className="text-xs text-blue-600 dark:text-blue-300">{description}</p>
        </div>
      </div>
      <ArrowRightIcon className="shrink-0 size-4 text-blue-500 group-hover:translate-x-1 transition-transform duration-200" />
    </div>
  );

  if (to.startsWith("http")) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className="my-4 block group">
        {inner}
      </a>
    );
  }

  return (
    <Link to={to} className="my-4 block group">
      {inner}
    </Link>
  );
}
