import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { toPublicOcrError } from "~/domain/ocr";
import { getLogger } from "~/lib/observability.server";
import { getOcrUploadQuota, publishPendingOcrOutbox, submitOcrJob } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.ocr.jobs.submit", jobUid: params.jobUid });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });
  try {
    const job = await submitOcrJob(env, sensei.id, params.jobUid, { ctx });
    const quota = await getOcrUploadQuota(env, sensei.id, { ctx, jobKind: job.jobKind });
    ctx.waitUntil(publishPendingOcrOutbox(env, 25, { ctx }));
    return data({ ...job, quota });
  } catch (error) {
    const publicError = toPublicOcrError(error, "업로드한 파일을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (!publicError.expected) logger.error("OCR job submission failed", error);
    return data({ error: publicError.message }, { status: publicError.status });
  }
};
