import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { RouteErrorBoundary } from "~/components/features/layout";
import { routeError } from "~/lib/http-errors";
import { canonicalLink } from "~/lib/seo";
import { getPostByUid } from "~/models/post";
import PostArticle from "./posts.$uid._components/PostArticle";

function notFoundResponse() {
  return routeError(404, "post.not_found", "게시물을 찾을 수 없어요.");
}

export const loader = async ({ context, params }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) {
    throw notFoundResponse();
  }

  const { env, ctx } = context.cloudflare;
  const post = await getPostByUid(env, uid, { ctx });
  if (!post) {
    throw notFoundResponse();
  }

  return {
    post: {
      uid: post.uid,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
    },
  };
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data?.post) {
    return [
      { title: "게시물 | 몰루로그" },
      { name: "description", content: "몰루로그 게시물 내용을 확인해보세요." },
      canonicalLink(location.pathname),
    ];
  }

  const title = `${data.post.title} | 몰루로그`;
  const description = `${data.post.title} 게시물 내용을 확인해보세요.`;
  return [{ title }, { name: "description", content: description }, canonicalLink(location.pathname)];
};

export const ErrorBoundary = RouteErrorBoundary;

export default function PostDetailPage() {
  const { post } = useLoaderData<typeof loader>();
  return <PostArticle post={post} />;
}
