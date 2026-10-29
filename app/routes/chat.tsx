import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RouteErrorBoundary } from "~/components/features/layout";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { isAdminSensei } from "~/domain/sensei-role";
import { getLogger } from "~/lib/observability.server";
import type { QuestionRunResult } from "~/models/al1s-question-contract";
import { getQuestionMemberDataConsentAt } from "~/models/sensei";
import type { ChatErrorCode } from "~/domain/chat-conversation";
import { type ChatInput, QuestionChat, type QuestionChatActionResult } from "./chat._components/QuestionChat";
import { mapChatActionErrorCode, postChatAction } from "./chat._components/chat-client";

type ChatSensei = { id: number; username: string; role: "guest" | "app_developer" | "admin" };
type ChatPageData = { isSignedIn: boolean; initialConsent: boolean; consentUnavailable: boolean };

export const meta: MetaFunction = () => [{ title: "AI 챗봇 | 몰루로그" }];
export const ErrorBoundary = RouteErrorBoundary;

export async function loadChatPageData(
  resolveSensei: () => Promise<ChatSensei | null>,
  readConsent: (senseiId: number) => Promise<Date | null>,
  reportConsentReadError: (error: unknown) => void = () => undefined,
): Promise<ChatPageData> {
  const sensei = await resolveSensei();
  if (!isAdminSensei(sensei)) throw new Response("Not Found", { status: 404 });
  try {
    const consentedAt = await readConsent(sensei.id);
    return { isSignedIn: true, initialConsent: consentedAt !== null, consentUnavailable: false };
  } catch (error) {
    reportConsentReadError(error);
    return { isSignedIn: true, initialConsent: false, consentUnavailable: true };
  }
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "chat.loader" });
  return loadChatPageData(
    () => getActiveSensei(env, request, ctx),
    (senseiId) => getQuestionMemberDataConsentAt(env, senseiId, { ctx }),
    (error) => logger.error("Failed to read AI question consent", error),
  );
};

export default function ChatRoute() {
  const pageData = useLoaderData<typeof loader>();
  const onConsent = async (consented: boolean) => {
    try {
      const result = await postChatAction<{ ok: boolean }>({ intent: consented ? "consent" : "revoke" });
      return result.ok;
    } catch {
      return false;
    }
  };
  const onAsk = async (input: ChatInput): Promise<QuestionChatActionResult> => {
    try {
      const result = await postChatAction<
        | { intent: "question"; ok: true; result: QuestionRunResult; conversationUid: string; messageUid: string }
        | { intent: "question"; ok: false; code: ChatErrorCode; conversationUid?: string; messageUid?: string }
      >({ intent: "question", ...input });
      return result.ok
        ? { ok: true, result: result.result, conversationUid: result.conversationUid, messageUid: result.messageUid }
        : { ok: false, code: result.code, conversationUid: result.conversationUid, messageUid: result.messageUid };
    } catch (error) {
      return { ok: false, code: mapChatActionErrorCode(error) };
    }
  };

  return (
    <V2Page width="reading">
      <PageHeader title={<span className="text-lg leading-7 md:text-xl">AI 챗봇</span>} />
      <PageMain>
        <QuestionChat
          isSignedIn={pageData.isSignedIn}
          initialConsent={pageData.initialConsent}
          consentUnavailable={pageData.consentUnavailable}
          onConsent={onConsent}
          onAsk={onAsk}
        />
      </PageMain>
    </V2Page>
  );
}
