import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { parseOcrUploadInputs } from "~/domain/ocr";
import { createOcrJob } from "~/models/ocr-job";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  try {
    const images = parseOcrUploadInputs(await request.json());
    return data(await createOcrJob(env, sensei.id, images, { ctx }), { status: 201 });
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "OCR 작업을 만들지 못했어요" }, { status: 400 });
  }
};
