import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getOcrJob } from "~/models/ocr-job";
import { createSyncDraft } from "~/models/sync-draft";

type DraftItem = { itemUid: string; quantity: number; meta?: unknown };

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) return data({ error: "로그인이 필요해요" }, { status: 401 });
  if (!params.jobUid) return data({ error: "OCR 작업 UID가 필요해요" }, { status: 400 });
  try {
    const job = await getOcrJob(env, sensei.id, params.jobUid, { ctx });
    if (job?.status !== "review_ready") throw new Error("검토할 수 있는 OCR 결과가 없어요");
    const body = (await request.json()) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0) throw new Error("반영할 항목을 선택해주세요");
    const seen = new Set<string>();
    const items = body.items.map(parseDraftItem).filter((item) => {
      if (seen.has(item.itemUid)) throw new Error("같은 아이템이 두 번 포함되어 있어요");
      seen.add(item.itemUid);
      return true;
    });
    const draftUid = await createSyncDraft(env, sensei.id, {
      source: "first_party_ocr",
      type: "item_inventory",
      toolName: "몰루로그 스크린샷 인식",
      toolVersion: job.versions?.model,
      catalogVersion: job.versions?.catalog,
      entries: items.map((item) => ({ entryKey: item.itemUid, value: item.quantity, meta: item.meta })),
    });
    return data({ draftUid, reviewUrl: `/connect/import/${draftUid}` }, { status: 201 });
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "변경안을 만들지 못했어요" }, { status: 400 });
  }
};

function parseDraftItem(value: unknown): DraftItem {
  if (!value || typeof value !== "object") throw new Error("반영할 항목을 확인해주세요");
  const item = value as Record<string, unknown>;
  const itemUid = typeof item.itemUid === "string" ? item.itemUid.trim() : "";
  if (!itemUid) throw new Error("아이템 UID가 필요해요");
  if (!Number.isInteger(item.quantity) || (item.quantity as number) < 0) {
    throw new Error("수량은 0 이상의 정수여야 해요");
  }
  return { itemUid, quantity: item.quantity as number, meta: item.meta };
}
