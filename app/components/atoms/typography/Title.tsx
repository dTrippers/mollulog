import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { Link } from "react-router";

type TitleProps = {
  text: string;
  description?: string;
  className?: string;
  parentPath?: string;
}

export default function Title({ text, description, className, parentPath }: TitleProps) {
  return (
    <div className="my-8">
      <div className={`flex items-center gap-x-2 ${className ?? ""}`}>
        {parentPath && (
          <Link
            to={parentPath}
            className="rounded-lg p-1 transition hover:bg-neutral-100 hover:text-neutral-500 dark:hover:bg-neutral-800"
            aria-label="상위 페이지로 이동"
          >
            <ChevronLeftIcon className="size-8" strokeWidth={2} />
          </Link>
        )}
        <h1 className="font-black text-3xl md:text-4xl drop-shadow-xl drop-shadow-neutral-300/50 dark:drop-shadow-neutral-700/50">
          {text}
        </h1>
      </div>
      {description && <p className="my-4 text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
  );
}
