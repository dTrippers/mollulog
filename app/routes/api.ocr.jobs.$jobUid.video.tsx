import type { LoaderFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getOcrVideoDownloadUrl } from "~/models/ocr-job";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.ocr.jobs.video", jobUid: params.jobUid });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "영상 정보를 확인해 주세요" }, { status: 400 });
  try {
    const downloadUrl = await getOcrVideoDownloadUrl(env, sensei.id, params.jobUid, { ctx });
    return downloadUrl
      ? redirect(downloadUrl, { headers: { "Cache-Control": "private, no-store" } })
      : data({ error: "검토 가능한 원본 영상을 찾을 수 없어요" }, { status: 404 });
  } catch (error) {
    logger.error("OCR video evidence URL creation failed", error);
    return data({ error: "원본 영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
};
