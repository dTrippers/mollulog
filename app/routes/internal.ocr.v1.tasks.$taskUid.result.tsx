import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { OcrTaskResultRejectedError, parseOcrResultEnvelope, parseOcrTaskMessage } from "~/domain/ocr";
import { getLogger } from "~/lib/observability.server";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { commitOcrTaskResult, publishPendingOcrOutbox } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  if (!(await isAuthorizedOcrMachineRequest(request, env))) return data({ error: "Unauthorized" }, { status: 401 });
  const logger = getLogger(env, ctx, { route: "internal.ocr.tasks.result", taskUid: params.taskUid });

  let task: ReturnType<typeof parseOcrTaskMessage>;
  let resultEnvelope: ReturnType<typeof parseOcrResultEnvelope>;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    task = parseOcrTaskMessage({
      type: body.type,
      taskUid: params.taskUid,
      generation: body.generation,
    });
    resultEnvelope = parseOcrResultEnvelope(body);
  } catch (error) {
    logger.warn("Invalid OCR task result request", {
      error: error instanceof Error ? error.message : String(error),
    });
    return data({ error: "Invalid OCR task request" }, { status: 400 });
  }

  try {
    const result = await commitOcrTaskResult(env, task, resultEnvelope, { ctx });
    ctx.waitUntil(publishPendingOcrOutbox(env, 25, { ctx }));
    return data(result);
  } catch (error) {
    if (error instanceof OcrTaskResultRejectedError) {
      logger.warn("OCR task result rejected", {
        error: error.message,
        taskType: task.type,
        generation: task.generation,
      });
      return data({ error: "OCR task result rejected" }, { status: 400 });
    }
    logger.error("OCR task result commit failed", error, { taskType: task.type, generation: task.generation });
    return data({ error: "OCR task result failed" }, { status: 500 });
  }
};
