import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { OcrTaskResultRejectedError, parseOcrArtifactPreparationRequest, parseOcrTaskMessage } from "~/domain/ocr";
import { getLogger } from "~/lib/observability.server";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { prepareOcrResultArtifacts } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  if (!(await isAuthorizedOcrMachineRequest(request, env))) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }
  const logger = getLogger(env, ctx, {
    route: "internal.ocr.tasks.artifacts",
    taskUid: params.taskUid,
  });

  let task: ReturnType<typeof parseOcrTaskMessage>;
  let artifactRequest: ReturnType<typeof parseOcrArtifactPreparationRequest>;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    task = parseOcrTaskMessage({
      type: body.type,
      taskUid: params.taskUid,
      generation: body.generation,
    });
    artifactRequest = parseOcrArtifactPreparationRequest(body);
  } catch (error) {
    logger.warn("Invalid OCR artifact preparation request", {
      error: error instanceof Error ? error.message : String(error),
    });
    return data({ error: "Invalid OCR artifact request" }, { status: 400 });
  }

  try {
    return data(await prepareOcrResultArtifacts(env, task, artifactRequest, { ctx }));
  } catch (error) {
    if (error instanceof OcrTaskResultRejectedError) {
      logger.warn("OCR artifact preparation rejected", {
        error: error.message,
        taskType: task.type,
        generation: task.generation,
      });
      return data({ error: "OCR artifact request rejected" }, { status: 400 });
    }
    logger.error("OCR artifact preparation failed", error, {
      taskType: task.type,
      generation: task.generation,
    });
    return data({ error: "OCR artifact preparation failed" }, { status: 500 });
  }
};
