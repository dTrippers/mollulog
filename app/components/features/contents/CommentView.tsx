import { Link } from "react-router";
import dayjs from "dayjs";
import { LockClosedIcon } from "@heroicons/react/16/solid";
import { ProfileImage } from "~/components/primitives";

type CommentViewProps = {
  body: string;
  visibility: "private" | "public";
  createdAt: string;
  variant?: "default" | "compact";
  sensei: {
    username: string;
    profileStudentId: string | null;
  };
};

export default function CommentView({ body, visibility, createdAt, sensei, variant = "default" }: CommentViewProps) {
  const formattedTime = dayjs(createdAt).format("YYYY-MM-DD");
  const compact = variant === "compact";
  return (
    <div className="flex gap-x-2 items-begin">
      <Link to={`/@${sensei.username}`} className={`${compact ? "mt-0.5" : "mt-1"} shrink-0`}>
        <ProfileImage studentUid={sensei.profileStudentId} imageSize={compact ? 6 : 8} />
      </Link>
      <div className="flex-1">
        <div className="flex items-center gap-x-1 text-xs">
          <Link to={`/@${sensei.username}`} className="hover:underline">
            <span className="font-bold">@{sensei.username}</span>
          </Link>
          <span className="text-neutral-500 dark:text-neutral-400 ml-1">{formattedTime}</span>
          {visibility === "private" && <LockClosedIcon className="size-4 mb-0.5" />}
        </div>
        <p className={`mt-0.5 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200 ${compact ? "text-sm leading-5" : "text-sm xl:text-base"}`}>
          {body}
        </p>
      </div>
    </div>
  );
}
