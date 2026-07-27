import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { OcrPublicError, toPublicOcrError } from "~/domain/ocr";
import { getLogger } from "~/lib/observability.server";
import { cancelOcrJob } from "~/models/ocr-job";
import { getSyncDraftBySourceRef } from "~/models/sync-draft";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.ocr.jobs.cancel", jobUid: params.jobUid });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });

  try {
    const application = await getSyncDraftBySourceRef(env, sensei.id, "first_party_ocr", params.jobUid);
    if (application?.status === "applied") {
      throw new OcrPublicError("이미 반영한 인식 결과는 취소할 수 없어요", 409);
    }
    if (application) throw new OcrPublicError("이미 처리 중인 인식 결과예요", 409);

    return data(await cancelOcrJob(env, sensei.id, params.jobUid, { ctx }));
  } catch (error) {
    const publicError = toPublicOcrError(error, "인식 결과를 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!publicError.expected) logger.error("OCR job cancellation failed", error);
    return data({ error: publicError.message }, { status: publicError.status });
  }
};
