import { CubeTransparentIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";

type EmptyViewProps = {
  Icon?: typeof CubeTransparentIcon;
  text: string;
  description?: string;
  className?: string;
};

export default function EmptyView({ Icon, text, description, className }: EmptyViewProps) {
  const IconComponent = Icon ?? CubeTransparentIcon;

  return (
    <div className={cn("my-16 flex w-full flex-col items-center justify-center text-center text-muted-foreground", className)}>
      <IconComponent className="my-2 size-16" />
      <p className="my-2 text-sm font-medium text-foreground">{text}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
