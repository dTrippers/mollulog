import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { parseOcrTaskMessage } from "~/domain/ocr";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";
import { claimOcrTask } from "~/models/ocr-job";

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  if (!(await isAuthorizedOcrMachineRequest(request, env))) return data({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const task = parseOcrTaskMessage({ ...body, taskUid: params.taskUid });
    const workerId = typeof body.workerId === "string" && body.workerId ? body.workerId : "unknown-worker";
    const queueAttempts = Number.isInteger(body.queueAttempts) ? (body.queueAttempts as number) : 1;
    return data(await claimOcrTask(env, task, workerId, queueAttempts, { ctx }));
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "OCR 작업을 claim하지 못했어요" }, { status: 400 });
  }
};
