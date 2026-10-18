import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ContactReplyForm } from "~/components/v2/features/feedback/ContactReplyForm";
import { ContactRouteError } from "~/components/v2/features/feedback/ContactRouteError";
import { ContactStatus } from "~/components/v2/features/feedback/ContactStatus";
import { ContactThread } from "~/components/v2/features/feedback/ContactThread";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { formatInstant } from "~/lib/date-time";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import {
  createFeedbackReply,
  getFeedbackThreadByUidForUser,
  getFeedbackTicketByUidForUser,
  getLatestAdminFeedbackReplyId,
  markFeedbackTicketAdminRepliesSeen,
} from "~/models/feedback";

type ContactDetailActionData = {
  success?: boolean;
  error?: {
    content?: string;
  };
};

function notFoundResponse() {
  return routeError(404, "feedback.not_found", "문의 내역을 찾을 수 없어요.");
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const uid = params.uid;
  if (!uid) {
    throw notFoundResponse();
  }

  const thread = await getFeedbackThreadByUidForUser(env, uid, sensei.id, { ctx });
  if (!thread) {
    throw notFoundResponse();
  }

  await markFeedbackTicketAdminRepliesSeen(env, thread.ticket, getLatestAdminFeedbackReplyId(thread.replies), { ctx });

  return thread;
};

export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "contact.$uid",
  });
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const uid = params.uid;
  if (!uid) {
    throw notFoundResponse();
  }

  const ticket = await getFeedbackTicketByUidForUser(env, uid, currentUser.id, { ctx });
  if (!ticket) {
    throw notFoundResponse();
  }

  const formData = await request.formData();
  const content = String(formData.get("content") ?? "");
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return data<ContactDetailActionData>(
      {
        error: {
          content: "내용을 입력해주세요.",
        },
      },
      { status: 400 },
    );
  }

  try {
    await createFeedbackReply(env, ticket.id, currentUser.id, trimmedContent, { ctx });
    return data<ContactDetailActionData>({ success: true });
  } catch (error) {
    logger.error("Error creating feedback reply", error, {
      currentUserId: currentUser.id,
      ticketId: ticket.id,
      ticketUid: ticket.uid,
    });
    throw routeError(500, "feedback.reply_failed", "오류가 발생했어요. 잠시 후 다시 시도해주세요.");
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data ? `${data.ticket.title} | 제안/문의` : "문의 상세";
  return [
    { title: `${title} | 몰루로그` },
    {
      name: "description",
      content: data
        ? `${data.ticket.title} 문의의 상태와 대화 내역을 확인해보세요.`
        : "문의 상태와 대화 내역을 확인해보세요.",
    },
  ];
};

export const ErrorBoundary = ContactRouteError;

export default function ContactDetail() {
  const { ticket, replies } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();

  return (
    <V2Page width="reading">
      <PageHeader
        back={{ title: "제안/문의", to: "/contact" }}
        title={ticket.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={ticket.createdAt} className="tabular-nums">
              {formatInstant(ticket.createdAt, { timeZone, format: "YYYY/MM/DD HH:mm" })}
            </time>
            <span aria-hidden="true">·</span>
            <ContactStatus status={ticket.status} />
          </div>
        }
      />
      <PageMain>
        <div className="flex flex-col gap-v2-block-gap">
          <ContactThread ticket={ticket} replies={replies} />
          <ContactReplyForm />
        </div>
      </PageMain>
    </V2Page>
  );
}
