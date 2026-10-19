import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RouteErrorBoundary } from "~/components/features/layout";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { isAdminSensei } from "~/domain/sensei-role";
import { getLogger } from "~/lib/observability.server";
import type { QuestionRunResult } from "~/models/al1s-question-contract";
import { getQuestionMemberDataConsentAt } from "~/models/sensei";
import {
  type AskInput,
  type QuestionActionErrorCode,
  QuestionChat,
  type QuestionChatActionResult,
} from "./ask._components/QuestionChat";
import { mapAskActionErrorCode, postAskAction } from "./ask._components/ask-client";

type AskSensei = { id: number; username: string; role: "guest" | "admin" };
type AskPageData = { isSignedIn: boolean; initialConsent: boolean; consentUnavailable: boolean };

export const meta: MetaFunction = () => [{ title: "AI 질문 | 몰루로그" }];
export const ErrorBoundary = RouteErrorBoundary;

export async function loadAskPageData(
  resolveSensei: () => Promise<AskSensei | null>,
  readConsent: (senseiId: number) => Promise<Date | null>,
  reportConsentReadError: (error: unknown) => void = () => undefined,
): Promise<AskPageData> {
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
  const logger = getLogger(env, ctx, { route: "ask.loader" });
  return loadAskPageData(
    () => getActiveSensei(env, request, ctx),
    (senseiId) => getQuestionMemberDataConsentAt(env, senseiId, { ctx }),
    (error) => logger.error("Failed to read AI question consent", error),
  );
};

export default function AskRoute() {
  const pageData = useLoaderData<typeof loader>();
  const onConsent = async (consented: boolean) => {
    try {
      const result = await postAskAction<{ ok: boolean }>({ intent: consented ? "consent" : "revoke" });
      return result.ok;
    } catch {
      return false;
    }
  };
  const onAsk = async (input: AskInput): Promise<QuestionChatActionResult> => {
    try {
      const result = await postAskAction<
        | { intent: "question"; ok: true; result: QuestionRunResult }
        | { intent: "question"; ok: false; code: QuestionActionErrorCode }
      >({ intent: "question", ...input });
      return result.ok ? { ok: true, result: result.result } : { ok: false, code: result.code };
    } catch (error) {
      return { ok: false, code: mapAskActionErrorCode(error) };
    }
  };

  return (
    <V2Page width="reading">
      <PageHeader
        title={<span className="text-lg leading-7 md:text-xl">AI 질문</span>}
      />
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
