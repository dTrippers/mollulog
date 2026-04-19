import { redirect, type LoaderFunctionArgs, type MetaFunction } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const page = url.searchParams.get("page");
  const nextUrl = new URL("/community", url.origin);
  nextUrl.searchParams.set("type", "student_review");
  if (page && page !== "1") {
    nextUrl.searchParams.set("page", page);
  }

  return redirect(`${nextUrl.pathname}${nextUrl.search}`);
};

export const meta: MetaFunction = () => {
  const title = "학생 평가 목록 | 몰루로그";
  const description = "선생님들의 학생 평가 목록을 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
  ];
};

export default function StudentGradingsRedirectPage() {
  return null;
}
