import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { Link } from "react-router";
import { cn } from "~/lib/utils";

type TitleProps = {
  text: string;
  description?: string;
  className?: string;
  parentPath?: string;
};

export default function Title({ text, description, className, parentPath }: TitleProps) {
  return (
    <header className={cn("py-6", className)}>
      <div className="flex items-center gap-2">
        {parentPath && (
          <Link
            to={parentPath}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="상위 페이지로 이동"
          >
            <ChevronLeftIcon className="size-7" strokeWidth={2} />
          </Link>
        )}
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">{text}</h1>
      </div>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}
