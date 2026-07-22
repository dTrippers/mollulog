import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getOcrUploadQuota, publishPendingOcrOutbox, submitOcrJob } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });
  try {
    const job = await submitOcrJob(env, sensei.id, params.jobUid, { ctx });
    const quota = await getOcrUploadQuota(env, sensei.id, { ctx });
    ctx.waitUntil(publishPendingOcrOutbox(env, 25, { ctx }));
    return data({ ...job, quota });
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "이미지 제출을 완료하지 못했어요" }, { status: 400 });
  }
};
