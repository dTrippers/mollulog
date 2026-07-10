import { PlusCircleIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { ClickableSurface } from "~/components/primitives";
import { cn } from "~/lib/utils";

type AddContentButtonProps = {
  text: string;
  link?: string;
  onClick?: () => void;
};

export default function AddContentButton({ text, link, onClick }: AddContentButtonProps) {
  const className = cn(`
    mt-4 mb-4 flex items-center justify-center rounded-lg bg-muted px-4 py-3
    text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground cursor-pointer
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
