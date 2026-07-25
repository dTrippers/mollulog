import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getOwnedOcrArtifactObjectKey } from "~/models/ocr-job";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "api.ocr.jobs.artifact",
    jobUid: params.jobUid,
    artifactUid: params.artifactUid,
  });
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid || !params.artifactUid) {
    return data({ error: "인식 화면 정보를 확인해 주세요" }, { status: 400 });
  }

  try {
    const objectKey = await getOwnedOcrArtifactObjectKey(env, sensei.id, params.jobUid, params.artifactUid, { ctx });
    if (!objectKey) return data({ error: "인식 화면을 찾을 수 없어요" }, { status: 404 });
    const object = await env.OCR_UPLOADS.get(objectKey);
    if (!object) return data({ error: "인식 화면을 찾을 수 없어요" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Length": String(object.size),
        "Content-Type": "image/webp",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("OCR artifact read failed", error);
    return data({ error: "인식 화면을 불러오지 못했어요" }, { status: 500 });
  }
};
