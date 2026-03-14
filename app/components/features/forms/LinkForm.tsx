import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { Link } from "react-router";

type LinkFormProps = {
  label: string;
  value?: string;
  to: string;
  color?: "default" | "blue" | "red";
};

export default function LinkForm({ label, value, to, color = "default" }: LinkFormProps) {
  const colorClass = {
    default: "",
    blue: "text-blue-500",
    red: "text-red-500",
  }[color];

  return (
    <Link to={to}>
      <div className="flex items-center gap-x-2 p-4">
        <p className={`grow line-clamp-1 ${colorClass}`}>{label}</p>
        {value && <p className="shrink-0 text-neutral-500 dark:text-neutral-400">{value}</p>}
        <ChevronRightIcon className="size-4" />
      </div>
    </Link>
  );
}
