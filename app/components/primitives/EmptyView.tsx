import { CubeTransparentIcon } from "@heroicons/react/24/outline";

type EmptyViewProps = {
  Icon?: typeof CubeTransparentIcon;
  text: string;
};

export default function EmptyView({ Icon, text }: EmptyViewProps) {
  const IconComponent = Icon ?? CubeTransparentIcon;
  return (
    <div className="my-16 w-full flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400">
      <IconComponent className="my-2 w-16 h-16" />
      <p className="my-2 text-sm">{text}</p>
    </div>
  );
}
