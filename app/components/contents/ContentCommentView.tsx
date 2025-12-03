import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/16/solid";

type ContentCommentViewProps = {
  comments?: {
    uid: string;
    body: string;
    visibility: "private" | "public";
    createdAt: string;
    sensei: {
      username: string;
      profileStudentId: string | null;
    };
    subcomments?: {
      uid: string;
      body: string;
      visibility: "private" | "public";
      createdAt: string;
      sensei: {
        username: string;
        profileStudentId: string | null;
      };
    }[];
  }[];

  onClick?: () => void;
}

export default function ContentCommentView({ comments, onClick }: ContentCommentViewProps) {
  const commentCount = comments ? comments.reduce((acc, comment) => acc + 1 + (comment.subcomments?.length ?? 0), 0) : 0;
  
  return (
    <div
      className="w-full p-2 flex items-center gap-x-1 bg-neutral-100 dark:bg-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-sm cursor-pointer transition"
      onClick={onClick}
    >
      <ChatBubbleOvalLeftEllipsisIcon className="shrink-0 size-4 text-neutral-500 dark:text-neutral-400" />
      {comments && <span className="text-neutral-500 dark:text-neutral-400">{commentCount}</span>}
      <p className="ml-1 pl-2 border-l border-neutral-200 dark:border-neutral-700 grow text-neutral-400 dark:text-neutral-600">
        의견을 남겨보세요
      </p>
    </div>
  );
}

