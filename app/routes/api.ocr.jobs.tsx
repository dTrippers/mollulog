import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { parseOcrUploadRequest } from "~/domain/ocr";
import { createOcrJob, getOcrUploadQuota, listRecentOcrJobs, OcrQuotaExceededError } from "~/models/ocr-job";
import { listSyncDraftsBySourceRefs } from "~/models/sync-draft";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  const [jobs, quota] = await Promise.all([
    listRecentOcrJobs(env, sensei.id, { ctx }),
    getOcrUploadQuota(env, sensei.id, { ctx }),
  ]);
  const applications = await listSyncDraftsBySourceRefs(
    env,
    sensei.id,
    "first_party_ocr",
    jobs.map((job) => job.uid),
  );
  return data({
    quota,
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
    const input = parseOcrUploadRequest(await request.json());
    return data(await createOcrJob(env, sensei.id, input, { ctx }), { status: 201 });
  } catch (error) {
    if (error instanceof OcrQuotaExceededError) {
      return data({ error: error.message, quota: error.quota }, { status: 429 });
    }
    return data({ error: error instanceof Error ? error.message : "OCR 작업을 만들지 못했어요" }, { status: 400 });
  }
};

function toApplication(draft: { status: string; appliedAt: string | null } | undefined) {
  return draft ? { status: draft.status, appliedAt: draft.appliedAt } : null;
}
