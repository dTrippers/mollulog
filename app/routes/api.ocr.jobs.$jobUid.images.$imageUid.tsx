import type { LoaderFunctionArgs } from "react-router";
import { data, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getOcrImageDownloadUrl } from "~/models/ocr-job";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid || !params.imageUid) {
    return data({ error: "OCR 이미지 정보를 확인해 주세요" }, { status: 400 });
  }
  const downloadUrl = await getOcrImageDownloadUrl(env, sensei.id, params.jobUid, params.imageUid, { ctx });
  return downloadUrl
    ? redirect(downloadUrl, { headers: { "Cache-Control": "private, no-store" } })
    : data({ error: "OCR 이미지를 찾을 수 없어요" }, { status: 404 });
};
