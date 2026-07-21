import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { parseOcrUploadInputs } from "~/domain/ocr";
import { createOcrJob, listRecentOcrJobs } from "~/models/ocr-job";
import { listSyncDraftsBySourceRefs } from "~/models/sync-draft";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  const jobs = await listRecentOcrJobs(env, sensei.id, { ctx });
  const applications = await listSyncDraftsBySourceRefs(
    env,
    sensei.id,
    "first_party_ocr",
    jobs.map((job) => job.uid),
  );
  return data({
    jobs: jobs.map((job) => ({
      ...job,
      application: toApplication(applications[job.uid]),
    })),
  });
};

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

function toApplication(draft: { status: string; appliedAt: string | null } | undefined) {
  return draft ? { status: draft.status, appliedAt: draft.appliedAt } : null;
}
