import { PlusCircleIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { ClickableSurface } from "~/components/primitives";
import { sanitizeClassName } from "~/prophandlers";

type AddContentButtonProps = {
  text: string;
  link?: string;
  onClick?: () => void;
};

export default function AddContentButton({ text, link, onClick }: AddContentButtonProps) {
  const className = sanitizeClassName(`
    mt-8 mb-4 p-4 flex justify-center items-center border
    border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600
    rounded-lg transition cursor-pointer
  `);
  const content = (
    <>
      <PlusCircleIcon className="size-4 mr-1" />
      <span>{text}</span>
    </>
  );

  if (link) {
    return (
      <Link to={link} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <ClickableSurface onClick={onClick} className={className}>
      {content}
    </ClickableSurface>
  );
}
