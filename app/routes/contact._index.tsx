import { BellIcon, ChatBubbleLeftRightIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ContactForm } from "~/components/v2/features/feedback/ContactForm";
import { ContactHistoryPanel } from "~/components/v2/features/feedback/ContactHistoryPanel";
import { ContactNotificationLink } from "~/components/v2/features/feedback/ContactNotificationLink";
import { ContactRouteError } from "~/components/v2/features/feedback/ContactRouteError";
import { MobileActionBar, PageAside, PageHeader, PageMain, PanelSheet, V2Page } from "~/components/v2/layout";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { parseFeedbackAdditional } from "~/domain/feedback";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { createFeedbackTicket, getFeedbackTicketsByUserId } from "~/models/feedback";

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
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return { authenticated: false as const, tickets: null };
  }

  return {
    authenticated: true as const,
    tickets: await getFeedbackTicketsByUserId(env, sensei.id, { ctx }),
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "contact" });
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const title = String(formData.get("title") ?? "");
  const content = String(formData.get("content") ?? "");
  const additionalValue = formData.get("additional");
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
    return data<ContactActionData>({ error, values: { title, content } }, { status: 400 });
  }

  let additional: ReturnType<typeof parseFeedbackAdditional>;
  try {
    additional = parseFeedbackAdditional(typeof additionalValue === "string" ? additionalValue : null);
  } catch {
    throw routeError(400, "feedback.additional_invalid", "오류 제보 정보를 확인할 수 없어요.");
  }

  try {
    const ticketUid = await createFeedbackTicket(env, currentUser.id, trimmedTitle, trimmedContent, null, additional, {
      ctx,
    });
    return redirect(`/contact/${ticketUid}`);
  } catch (error) {
    logger.error("Error creating feedback ticket", error, {
      currentUserId: currentUser.id,
      titleLength: trimmedTitle.length,
    });
    throw routeError(500, "feedback.create_failed", "오류가 발생했어요. 잠시 후 다시 시도해주세요.");
  }
};

export const meta: MetaFunction = () => [
  { title: "제안/문의 | 몰루로그" },
  {
    name: "description",
    content: "컨텐츠 및 기능 제안, 오류 신고, 기타 문의 사항과 답변 내역을 확인해보세요.",
  },
];

export const ErrorBoundary = ContactRouteError;

export default function Contact() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting" && navigation.formMethod?.toLowerCase() === "post";

  return (
    <V2Page width="reading">
      <PageHeader
        title="제안/문의"
        description="서비스 개선을 위한 의견이나 새로운 기능 요청, 발견한 문제점이 있다면 알려주세요."
      />
      <PageMain>
        {loaderData.authenticated ? (
          <ContactForm errors={actionData?.error} values={actionData?.values} submitting={isSubmitting} />
        ) : (
          <section className="rounded-lg bg-v2-surface p-v2-block-p">
            <StatusNotice tone="neutral">
              <div className="flex flex-col gap-2">
                <p className="font-medium">문의 등록에는 로그인이 필요해요.</p>
                <p className="text-sm text-v2-fg-secondary">계정이 없으신 경우 메일로도 문의를 남기실 수 있어요.</p>
                <a
                  className="inline-flex min-h-v2-control-min items-center gap-2 rounded-md underline underline-offset-4 hover:text-v2-fg"
                  href="mailto:contact@mollulog.net"
                >
                  <EnvelopeIcon className="size-4" aria-hidden="true" />
                  contact@mollulog.net
                </a>
              </div>
            </StatusNotice>
          </section>
        )}
      </PageMain>
      {loaderData.authenticated ? (
        <>
          <PageAside>
            <PanelSheet panelId="contact-history" title="내 문의 내역" Icon={ChatBubbleLeftRightIcon}>
              <ContactHistoryPanel tickets={loaderData.tickets} />
            </PanelSheet>
            <div className="flex justify-end">
              <ContactNotificationLink />
            </div>
          </PageAside>
          <MobileActionBar
            links={[
              {
                key: "notifications",
                title: "답변 알림 설정",
                Icon: BellIcon,
                to: "/notifications",
                transition: "forward",
              },
            ]}
            panels={[
              {
                panelId: "contact-history",
                title: "내 문의 내역",
                shortTitle: "내 문의",
                Icon: ChatBubbleLeftRightIcon,
              },
            ]}
          />
        </>
      ) : null}
    </V2Page>
  );
}
