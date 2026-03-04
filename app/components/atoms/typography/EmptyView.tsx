import { SparklesIcon } from "@heroicons/react/24/outline";

type EmptyViewProps = {
  Icon?: typeof SparklesIcon;
  text: string;
};

export default function EmptyView({ Icon, text }: EmptyViewProps) {
  const IconComponent = Icon ?? SparklesIcon;
  return (
    <div className="my-16 w-full flex flex-col items-center justify-center">
      <IconComponent className="my-2 w-16 h-16" strokeWidth={2} />
      <p className="my-2 text-sm">{text}</p>
    </div>
  )
};
