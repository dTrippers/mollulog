import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { parseOcrTaskMessage } from "~/domain/ocr";
import { getLogger } from "~/lib/observability.server";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { claimOcrTask } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  if (!(await isAuthorizedOcrMachineRequest(request, env))) return data({ error: "Unauthorized" }, { status: 401 });
  const logger = getLogger(env, ctx, { route: "internal.ocr.tasks.claim", taskUid: params.taskUid });

  let body: Record<string, unknown>;
  let task: ReturnType<typeof parseOcrTaskMessage>;
  try {
    body = (await request.json()) as Record<string, unknown>;
    task = parseOcrTaskMessage({ ...body, taskUid: params.taskUid });
  } catch (error) {
    logger.warn("Invalid OCR task claim request", {
      error: error instanceof Error ? error.message : String(error),
    });
    return data({ error: "Invalid OCR task request" }, { status: 400 });
  }

  try {
    const workerId = typeof body.workerId === "string" && body.workerId ? body.workerId : "unknown-worker";
    const queueAttempts = Number.isInteger(body.queueAttempts) ? (body.queueAttempts as number) : 1;
    return data(await claimOcrTask(env, task, workerId, queueAttempts, { ctx }));
  } catch (error) {
    logger.error("OCR task claim failed", error, { taskType: task.type, generation: task.generation });
    return data({ error: "OCR task claim failed" }, { status: 500 });
  }
};
