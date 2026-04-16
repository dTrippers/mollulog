import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, isRouteErrorResponse, redirect, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";

import { getAuthenticator } from "~/auth/authenticator.server";
import { Callout, Title } from "~/components/primitives";
import { ErrorPage } from "~/components/features/layout";
import { getLogger } from "~/lib/observability.server";
import { createFeedbackTicket, getFeedbackTicketsByUserId } from "~/models/feedback";
import TicketForm from "./contact._components/TicketForm";
import TicketList from "./contact._components/TicketList";

type ContactActionData = {
  error?: {
    title?: string;
    content?: string;
  };
  values?: {
    title?: string;
    content?: string;
  };
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getAuthenticator(env, ctx).isAuthenticated(request);
  if (!sensei) {
    return { authenticated: false as const, tickets: null };
  }

  return {
    authenticated: true as const,
    tickets: await getFeedbackTicketsByUserId(env, sensei.id),
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "contact",
  });
  const currentUser = await getAuthenticator(env, ctx).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const title = String(formData.get("title") ?? "");
  const content = String(formData.get("content") ?? "");
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  const error: NonNullable<ContactActionData["error"]> = {};
  if (!trimmedTitle) {
    error.title = "제목을 입력해주세요.";
  }
  if (!trimmedContent) {
    error.content = "내용을 입력해주세요.";
  }

  if (Object.keys(error).length > 0) {
    return data<ContactActionData>(
      {
        error,
        values: { title, content },
      },
      { status: 400 },
    );
  }

  try {
    const ticketUid = await createFeedbackTicket(
      env,
      currentUser.id,
      trimmedTitle,
      trimmedContent,
      null,
    );

    return redirect(`/contact/${ticketUid}`);
  } catch (error) {
    logger.error("Error creating feedback ticket", error, {
      currentUserId: currentUser.id,
      titleLength: trimmedTitle.length,
    });
    throw new Response(
      JSON.stringify({
        error: { message: "오류가 발생했어요. 잠시 후 다시 시도해주세요." },
      }),
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
    {
      name: "description",
      content: "컨텐츠 및 기능 제안, 오류 신고, 기타 문의 사항과 답변 내역을 확인해보세요.",
    },
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
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting" && navigation.formMethod?.toLowerCase() === "post";

  return (
    <div className="mx-auto max-w-3xl">
      <Title
        text="제안/문의"
        description="서비스 개선을 위한 의견이나 새로운 기능 요청, 발견한 문제점이 있다면 알려주세요."
      />

      {!loaderData.authenticated ? (
        <Callout>
          <div className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
            <p>문의를 등록하려면 로그인이 필요해요.</p>
            <p>
              계정이 없으신 경우{" "}
              <a
                href="mailto:contact@mollulog.net"
                className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                contact@mollulog.net
              </a>
              으로 연락주세요.
            </p>
          </div>
        </Callout>
      ) : (
        <div className="flex flex-col gap-8">
          <TicketList tickets={loaderData.tickets} />
          <TicketForm errors={actionData?.error} values={actionData?.values} submitting={isSubmitting} />
        </div>
      )}
    </div>
  );
}
