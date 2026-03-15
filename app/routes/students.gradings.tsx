import { useNavigate, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { StudentGradingTimeline } from "~/components/features/students";
import { EmptyView, Pagination, SubTitle } from "~/components/primitives";
import { getAllStudentsMap } from "~/models/student";
import { getRecentStudentGradingsPageWithUsers } from "~/models/student-grading";

const PAGE_SIZE = 20;

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const page = parsePage(request);
  const [gradingPage, allStudentsMap] = await Promise.all([
    getRecentStudentGradingsPageWithUsers(env, page, PAGE_SIZE, true),
    getAllStudentsMap(env, true),
  ]);

  return {
    page: gradingPage.page,
    totalPages: gradingPage.totalPages,
    gradings: gradingPage.items.map((grading) => ({
      ...grading,
      student: {
        uid: grading.studentUid,
        name: allStudentsMap[grading.studentUid].name,
      },
    })),
  };
};

export const meta: MetaFunction = () => {
  const title = "학생 평가 목록 | 몰루로그";
  const description = "선생님들의 학생 평가 목록을 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export default function StudentGradingsIndexPage() {
  const { gradings, page, totalPages } = useLoaderData<typeof loader>();
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
    navigate(query ? `/students/gradings?${query}` : "/students/gradings");
  };

  return (
    <div className="space-y-6">
      <SubTitle text="학생 평가 목록" />
      <StudentGradingTimeline gradings={gradings} />
      <Pagination currentPage={page} totalPages={totalPages} onPageChange={handlePageChange} />
    </div>
  );
}
