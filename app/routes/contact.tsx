import { useFetcher, useRouteError, isRouteErrorResponse, redirect } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useState, useEffect } from "react";
import { CheckCircleIcon, ArrowPathIcon } from "@heroicons/react/20/solid";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ErrorPage } from "~/components/features/layout";
import { Button, Input, Textarea, Title } from "~/components/primitives";
import { createFeedbackSubmission } from "~/models/feedback";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const sensei = await getAuthenticator(context.cloudflare.env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const replyEmail = formData.get("replyEmail") as string | null;

  if (!title.trim()) {
    return { error: { title: "제목을 입력해주세요." } };
  }
  if (!content.trim()) {
    return { error: { content: "내용을 입력해주세요." } };
  }
  if (replyEmail && !replyEmail.includes("@")) {
    return { error: { replyEmail: "올바른 이메일 주소를 입력해주세요." } };
  }

  try {
    await createFeedbackSubmission(env, currentUser.id, title.trim(), content.trim(), replyEmail);
    return { success: true };
  } catch (error) {
    console.error("Error creating feedback submission:", error);
    throw new Response(
      JSON.stringify({ error: { message: "오류가 발생했어요. 잠시 후 다시 시도해주세요." } }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}; 

export const meta: MetaFunction = () => {
  return [
    { title: "제안/문의 | 몰루로그" },
    { name: "description", content: "게임 <블루 아카이브> 관련 컨텐츠 제안, 오류 신고, 기타 문의 사항을 제출해주세요." },
  ];
};

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <ErrorPage message={error.data.error.message} />;
  }
  return <ErrorPage />;
}


export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const fetcher = useFetcher<typeof action>();
  useEffect(() => {
    if (fetcher.data?.success) {
      setSubmitted(true);
    }
  }, [fetcher.data]);

  if (submitted) {
    return (
      <>
        <Title text="제안/문의" />
        <div className="p-4 flex gap-4 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
          <CheckCircleIcon className="my-2 w-16 h-16" strokeWidth={2} />
          <div className="flex flex-col">
            <p className="my-2 text-2xl font-bold">의견 감사합니다!</p>
            <p>답변이 필요한 내용의 경우 남겨주신 연락처로 연락드리겠습니다.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Title text="제안/문의" />
      <p className="text-neutral-500 dark:text-neutral-400 -mt-2 mb-6">
        서비스 개선을 위한 의견이나 새로운 기능 요청, 발견한 문제점 등을 제출해주세요.
      </p>

      <fetcher.Form method="post">
        <Input label="제목" name="title" error={fetcher.data?.error?.title} required />
        <Input label="연락처 (선택)" name="replyEmail" description="답변이 필요한 경우 이메일 주소를 남겨주세요." error={fetcher.data?.error?.replyEmail} />
        <Textarea label="내용" name="content" rows={6} error={fetcher.data?.error?.content} required />

        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          제출된 정보는 서비스 개선 등을 위해서만 사용하며, 개인정보 등은 목적 달성 즉시 파기됩니다.
        </p>
        <Button
          type="submit"
          text={fetcher.state === "submitting" ? "제출 중..." : "제출하기"}
          variant="primary"
          disabled={fetcher.state === "submitting"}
          icon={fetcher.state === "submitting" ? ArrowPathIcon : undefined}
        />
      </fetcher.Form>
    </>
  );
}
