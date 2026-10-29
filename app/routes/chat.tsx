import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RouteErrorBoundary } from "~/components/features/layout";
import { PageAside, PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import {
  CHAT_CONVERSATION_LIST_DAYS,
  type ChatConversation,
  type ChatConversationSummary,
  type ChatErrorCode,
  chatConversationTitle,
} from "~/domain/chat-conversation";
import { isAdminSensei } from "~/domain/sensei-role";
import { getLogger } from "~/lib/observability.server";
import type { QuestionRunResult } from "~/models/al1s-question-contract";
import { listChatConversations, readChatConversation } from "~/models/chat-conversation";
import { getQuestionMemberDataConsentAt } from "~/models/sensei";
import { ChatHistoryPanel, ChatMobileToolbar } from "./chat._components/ChatHistoryPanel";
import { mapChatActionErrorCode, postChatAction } from "./chat._components/chat-client";
import { addInFlightChatSends, getChatScreenKey, type InFlightChatSend } from "./chat._components/chat-ui-state";
import { type ChatInput, QuestionChat, type QuestionChatActionResult } from "./chat._components/QuestionChat";

type ChatSensei = { id: number; username: string; role: "guest" | "app_developer" | "admin" };
type ChatPageData = {
  isSignedIn: boolean;
  initialConsent: boolean;
  consentUnavailable: boolean;
  conversations: ChatConversationSummary[];
  selectedUid: string | null;
  selectedConversation: ChatConversation | null;
  loadedAt: Date;
};

type RouteInFlightChatSend = InFlightChatSend & {
  baseLoadedAt: number;
  awaitingRefresh: boolean;
};

export const meta: MetaFunction = () => [{ title: "AI 챗봇 | 몰루로그" }];
export const ErrorBoundary = RouteErrorBoundary;

export async function loadChatPageData(
  resolveSensei: () => Promise<ChatSensei | null>,
  readConsent: (senseiId: number) => Promise<Date | null>,
  readChatData: (
    senseiId: number,
    conversationUid: string | null,
    loadedAt: Date,
  ) => Promise<{ conversations: ChatConversationSummary[]; selectedConversation: ChatConversation | null }>,
  conversationUid: string | null,
  reportConsentReadError: (error: unknown) => void = () => undefined,
): Promise<ChatPageData> {
  const sensei = await resolveSensei();
  if (!isAdminSensei(sensei)) throw new Response("Not Found", { status: 404 });
  let initialConsent = false;
  let consentUnavailable = false;
  try {
    const consentedAt = await readConsent(sensei.id);
    initialConsent = consentedAt !== null;
  } catch (error) {
    consentUnavailable = true;
    reportConsentReadError(error);
  }
  const loadedAt = new Date();
  const { conversations, selectedConversation } = await readChatData(sensei.id, conversationUid, loadedAt);
  return {
    isSignedIn: true,
    initialConsent,
    consentUnavailable,
    conversations,
    selectedUid: conversationUid,
    selectedConversation,
    loadedAt,
  };
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "chat.loader" });
  const conversationUid = new URL(request.url).searchParams.get("c");
  return loadChatPageData(
    () => getActiveSensei(env, request, ctx),
    (senseiId) => getQuestionMemberDataConsentAt(env, senseiId, { ctx }),
    async (senseiId, uid, now) => {
      const [conversations, selectedConversation] = await Promise.all([
        listChatConversations(env, { senseiId, now, listDays: CHAT_CONVERSATION_LIST_DAYS }, { ctx }),
        uid !== null ? readChatConversation(env, { senseiId, conversationUid: uid }, { ctx }) : Promise.resolve(null),
      ]);
      return { conversations, selectedConversation };
    },
    conversationUid,
    (error) => logger.error("Failed to read AI question consent", error),
  );
};

export default function ChatRoute() {
  const pageData = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [resetToken, setResetToken] = useState(0);
  const [activeSends, setActiveSends] = useState<RouteInFlightChatSend[]>([]);
  const onNewConversation = () => {
    setResetToken((token) => token + 1);
    navigate("/chat");
  };

  useEffect(() => {
    setActiveSends((current) => {
      const next = current.filter((send) => {
        if (!send.awaitingRefresh || !send.conversationUid || pageData.loadedAt.getTime() <= send.baseLoadedAt) {
          return true;
        }
        return !pageData.conversations.some((conversation) => conversation.uid === send.conversationUid);
      });
      return next.length === current.length ? current : next;
    });
  }, [pageData.conversations, pageData.loadedAt]);
  const onConsent = async (consented: boolean) => {
    try {
      const result = await postChatAction<{ ok: boolean }>({ intent: consented ? "consent" : "revoke" });
      return result.ok;
    } catch {
      return false;
    }
  };
  const onAsk = async (input: ChatInput): Promise<QuestionChatActionResult> => {
    const requestId = crypto.randomUUID();
    const savedConversation = pageData.conversations.find((conversation) => conversation.uid === input.conversationUid);
    const selectedConversation =
      pageData.selectedConversation?.uid === input.conversationUid ? pageData.selectedConversation : null;
    const existingQuestionCount = savedConversation?.questionCount ?? selectedConversation?.messages.length ?? 0;
    const title = savedConversation?.title ?? selectedConversation?.title ?? chatConversationTitle(input.question);
    setActiveSends((current) => [
      ...current,
      {
        requestId,
        conversationUid: input.conversationUid,
        title,
        startedAt: new Date(),
        questionCount: existingQuestionCount + (input.retryMessageUid ? 0 : 1),
        baseLoadedAt: pageData.loadedAt.getTime(),
        awaitingRefresh: false,
      },
    ]);
    let response: QuestionChatActionResult;
    try {
      const result = await postChatAction<
        | { intent: "question"; ok: true; result: QuestionRunResult; conversationUid: string; messageUid: string }
        | { intent: "question"; ok: false; code: ChatErrorCode; conversationUid?: string; messageUid?: string }
      >({ intent: "question", ...input });
      response = result.ok
        ? { ok: true, result: result.result, conversationUid: result.conversationUid, messageUid: result.messageUid }
        : { ok: false, code: result.code, conversationUid: result.conversationUid, messageUid: result.messageUid };
    } catch (error) {
      response = { ok: false, code: mapChatActionErrorCode(error) };
    }
    if (response.conversationUid) {
      setActiveSends((current) =>
        current.map((send) =>
          send.requestId === requestId
            ? { ...send, conversationUid: response.conversationUid ?? null, awaitingRefresh: true }
            : send,
        ),
      );
      revalidator.revalidate();
    } else {
      setActiveSends((current) => current.filter((send) => send.requestId !== requestId));
    }
    return response;
  };
  const onConversationUid = (uid: string) => navigate(`/chat?c=${encodeURIComponent(uid)}`);

  return (
    <V2Page width="wide">
      <PageHeader title="AI 챗봇" />
      <ChatMobileToolbar title={pageData.selectedConversation?.title ?? ""} onNewConversation={onNewConversation} />
      <PageMain>
        <div className="min-h-[calc(100dvh-8rem)] min-w-0 max-w-3xl">
          {pageData.selectedUid !== null && !pageData.selectedConversation ? (
            <div className="flex min-h-48 flex-col items-start justify-center gap-4">
              <p className="text-base text-v2-fg">대화를 찾을 수 없어요</p>
              <Button onClick={onNewConversation}>새 대화</Button>
            </div>
          ) : (
            <QuestionChat
              key={getChatScreenKey(pageData.selectedUid, pageData.selectedUid === null ? resetToken : 0)}
              isSignedIn={pageData.isSignedIn}
              initialConsent={pageData.initialConsent}
              consentUnavailable={pageData.consentUnavailable}
              onConsent={onConsent}
              onAsk={onAsk}
              initialConversationUid={pageData.selectedUid}
              initialMessages={pageData.selectedConversation?.messages ?? []}
              loadedAt={pageData.loadedAt}
              onConversationUid={onConversationUid}
            />
          )}
        </div>
      </PageMain>
      <PageAside>
        <ChatHistoryPanel
          conversations={addInFlightChatSends(pageData.conversations, activeSends)}
          selectedUid={pageData.selectedUid}
          loadedAt={pageData.loadedAt}
          onNewConversation={onNewConversation}
        />
      </PageAside>
    </V2Page>
  );
}
