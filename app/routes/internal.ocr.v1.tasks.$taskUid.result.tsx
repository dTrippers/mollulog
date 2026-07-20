import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { parseOcrResultEnvelope, parseOcrTaskMessage } from "~/domain/ocr";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { commitOcrTaskResult, publishPendingOcrOutbox } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  if (!(await isAuthorizedOcrMachineRequest(request, env))) return data({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const task = parseOcrTaskMessage({
      type: body.type,
      taskUid: params.taskUid,
      generation: body.generation,
    });
    const result = await commitOcrTaskResult(env, task, parseOcrResultEnvelope(body), { ctx });
    ctx.waitUntil(publishPendingOcrOutbox(env, 25, { ctx }));
    return data(result);
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "OCR 결과를 저장하지 못했어요" }, { status: 400 });
  }
};
