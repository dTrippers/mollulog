import dayjs from "dayjs";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { MarkdownText, Pagination, SectionCard, Title } from "~/components/primitives";
import { canonicalLink } from "~/lib/seo";
import { getNewsPosts } from "~/models/post";

const PAGE_SIZE = 5;

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

export const meta: MetaFunction = ({ location }) => {
  return [{ title: "업데이트 소식 | 몰루로그" }, canonicalLink(location.pathname)];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const page = parsePage(request);
  const postPage = await getNewsPosts(context.cloudflare.env, page, PAGE_SIZE);

  return {
    posts: postPage.items,
    page: postPage.page,
    totalPages: postPage.totalPages,
  };
}

export default function News() {
  const { posts, page, totalPages } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handlePageChange = (nextPage: number) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      nextSearchParams.delete("page");
    } else {
      nextSearchParams.set("page", String(nextPage));
    }
    const query = nextSearchParams.toString();
    navigate(query ? `/news?${query}` : "/news");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Title text="업데이트 소식" />
      <div className="mt-4">
        {posts.map((post) => (
          <SectionCard className="mb-4 last:mb-0" key={post.uid}>
            <h2 className="text-lg font-black md:text-xl">{post.title}</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {dayjs(post.createdAt).format("YYYY-MM-DD")}
            </p>
            <div className="mt-4">
              <MarkdownText text={post.content} />
            </div>
          </SectionCard>
        ))}
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={handlePageChange} />
      </div>
    </div>
  );
}
