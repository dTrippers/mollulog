import dayjs from "dayjs";
import { MarkdownText } from "~/components/primitives";
import type { Post } from "~/models/post";

type PostArticleProps = {
  post: Pick<Post, "title" | "content" | "createdAt">;
};

export default function PostArticle({ post }: PostArticleProps) {
  return (
    <article className="mx-auto min-h-[60dvh] max-w-3xl pt-3 md:pt-4">
      <header className="pb-5">
        <h1 className="break-words text-2xl font-black md:text-3xl">{post.title}</h1>
        <time className="mt-2 block text-sm text-muted-foreground" dateTime={post.createdAt}>
          {dayjs(post.createdAt).format("YYYY-MM-DD")}
        </time>
      </header>
      <div className="mt-6 [&_img]:mx-auto [&_img]:max-h-[60svh] [&_img]:w-auto [&_img]:object-contain">
        <MarkdownText text={post.content} />
      </div>
    </article>
  );
}
