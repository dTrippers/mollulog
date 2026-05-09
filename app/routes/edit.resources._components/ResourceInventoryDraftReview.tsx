import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { Form, Link, useNavigation } from "react-router";
import { Button, EmptyView, ResourceCard, Title } from "~/components/primitives";
import { cn } from "~/lib/utils";
import type { UserResourceInventoryDraft } from "~/models/user-resource-inventory";
import type { ItemCatalogResource } from "~/repositories/item-catalog";

type ResourceInventoryDraftReviewProps = {
  draft: UserResourceInventoryDraft;
  resourcesByUid: Record<string, ItemCatalogResource>;
  currentQuantities: Record<string, number>;
  error?: string;
};

export default function ResourceInventoryDraftReview({
  draft,
  resourcesByUid,
  currentQuantities,
  error,
}: ResourceInventoryDraftReviewProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const rows = draft.items.map((item) => ({
    item,
    resource: resourcesByUid[item.itemUid],
    currentQuantity: currentQuantities[item.itemUid] ?? 0,
    diff: item.quantity - (currentQuantities[item.itemUid] ?? 0),
  }));
  const changedRows = rows.filter((row) => row.diff !== 0);
  const isPending = draft.status === "pending";

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <Title
          text="보유 재화 변경 확인"
          description="현재 저장된 보유 수량과 새로 저장할 수량을 비교한 뒤 최종 반영합니다."
          className="my-0"
        />
        <Link to="/edit/resources" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-300">
          편집 화면으로 돌아가기
        </Link>
      </div>

      <section className="grid gap-2 md:grid-cols-3">
        <SummaryCell label="변경안 상태" value={draftStatusLabel(draft.status)} />
        <SummaryCell label="검토할 재화" value={`${draft.items.length.toLocaleString()}개`} />
        <SummaryCell label="실제 변경" value={`${changedRows.length.toLocaleString()}개`} />
      </section>

      {error ? (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-6 border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span className="col-span-3">재화</span>
          <span className="text-right">현재값</span>
          <span className="text-right">저장할 값</span>
          <span className="text-right">변화</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-8">
            <EmptyView Icon={ArchiveBoxIcon} text="검토할 재화가 없어요" />
          </div>
        ) : (
          <div className="overflow-auto">
            {rows.map(({ item, resource, currentQuantity, diff }) => (
              <div
                key={item.uid}
                className={cn(
                  "grid grid-cols-6 items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0",
                  diff !== 0 && "bg-blue-50/70 dark:bg-blue-950/20",
                )}
              >
                <div className="col-span-3 flex min-w-0 items-center gap-2">
                  {resource ? (
                    <ResourceCard
                      itemUid={resource.uid}
                      resourceType={resource.type}
                      rarity={resource.rarity}
                      name={resource.name}
                      size="md"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{resource?.name ?? "알 수 없는 재화"}</p>
                  </div>
                </div>
                <span className="text-right tabular-nums text-muted-foreground">{currentQuantity.toLocaleString()}</span>
                <span className="text-right font-semibold tabular-nums text-foreground">{item.quantity.toLocaleString()}</span>
                <span
                  className={cn(
                    "text-right text-xs font-semibold tabular-nums",
                    diff > 0 && "text-blue-600 dark:text-blue-300",
                    diff < 0 && "text-red-600 dark:text-red-300",
                    diff === 0 && "text-muted-foreground",
                  )}
                >
                  {diff === 0 ? "-" : diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isPending ? (
        <div className="flex justify-end gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="discard" />
            <Button type="submit" size="sm" variant="tint" disabled={isSubmitting}>
              변경안 폐기
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="apply" />
            <Button type="submit" size="sm" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
              {isSubmitting ? "저장 중..." : "저장하기"}
            </Button>
          </Form>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function draftStatusLabel(status: UserResourceInventoryDraft["status"]): string {
  switch (status) {
    case "applied":
      return "반영됨";
    case "discarded":
      return "폐기됨";
    default:
      return "대기 중";
  }
}
