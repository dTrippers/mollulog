import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getOcrJob } from "~/models/ocr-job";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });
  const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
  return job ? data(job) : data({ error: "OCR 작업을 찾을 수 없어요" }, { status: 404 });
};
