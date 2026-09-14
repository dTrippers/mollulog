import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout } from "~/components/primitives";
import type { EventRewardBonus, MinigameConfig, ShopResource, Stage } from "~/domain/event-shop";
import { type EventShopState, patchEventShopOwnedQuantities } from "~/domain/event-shop-state";
import { patchGuestEventShopPlanOwnedQuantities } from "~/domain/guest-event-shop-planner";
import { ResourceTypeEnum } from "~/graphql/graphql";
import {
  type GuestEventShopPlannerSnapshot,
  retryGuestEventShopPlannerPersistence,
  updateGuestEventShopPlanner,
} from "~/lib/guest-event-shop-planner.client";
import { type ResourceImageType, resourceImageUrl } from "~/models/assets";

export type PlannerShopContent = {
  stages: Stage[];
  shopResources: ShopResource[];
  eventRewardBonus: EventRewardBonus[];
  minigameConfig: MinigameConfig | null;
};

export type PlannerShopOwnedQuantityEditorProps = {
  timelineUid: string;
  shopStateUid: string;
  content: PlannerShopContent | null;
  state: EventShopState;
  defaultState: EventShopState;
  signedIn: boolean;
  onSaved?: (nextState: EventShopState) => void;
};

type CurrencyOption = {
  uid: string;
  type: ResourceTypeEnum;
  name: string;
  hasName: boolean;
};

type SaveNotice = {
  tone: "success" | "warning";
  message: string;
  retry?: "guest-persistence";
};

type WritableGuestEventShopPlannerSnapshot = {
  status: "ready" | "memory";
  envelope: Extract<GuestEventShopPlannerSnapshot, { status: "ready" | "memory" | "conflict" }>["envelope"];
};

const RESOURCE_IMAGE_TYPES: Record<ResourceTypeEnum, ResourceImageType> = {
  [ResourceTypeEnum.Currency]: "currency",
  [ResourceTypeEnum.Equipment]: "equipment",
  [ResourceTypeEnum.Furniture]: "furniture",
  [ResourceTypeEnum.Item]: "item",
};

function addCurrency(
  currencies: Map<string, CurrencyOption>,
  resource: { uid: string; type: ResourceTypeEnum; name?: string | null },
) {
  const name = resource.name?.trim();
  const existing = currencies.get(resource.uid);
  if (!existing || (!existing.hasName && name)) {
    currencies.set(resource.uid, {
      uid: resource.uid,
      type: resource.type,
      name: name || "이벤트 재화 이름을 확인할 수 없어요",
      hasName: Boolean(name),
    });
  }
}

function getPaymentCurrencies(content: PlannerShopContent | null): CurrencyOption[] {
  if (!content) return [];

  const currencies = new Map<string, CurrencyOption>();
  for (const resource of content.shopResources) {
    addCurrency(currencies, resource.paymentResource);
    for (const tier of resource.purchaseTiers) addCurrency(currencies, tier.paymentResource);
  }

  const minigame = content.minigameConfig;
  if (minigame) {
    const payments = [
      minigame.payment,
      ...minigame.payments,
      ...minigame.rewardGroups.flatMap((group) => group.payments),
    ];
    for (const payment of payments) {
      addCurrency(currencies, {
        uid: payment.resourceUid,
        type: payment.resourceType,
        name: payment.resourceName,
      });
    }
  }

  return [...currencies.values()].sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

function toDraft(quantities: Record<string, number>, currencies: readonly CurrencyOption[]): Record<string, string> {
  return Object.fromEntries(currencies.map(({ uid }) => [uid, String(quantities[uid] ?? 0)]));
}

function recordValuesEqual<T extends string | number>(left: Record<string, T>, right: Record<string, T>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function hasDraftChanges(
  draft: Record<string, string>,
  savedQuantities: Record<string, number>,
  currencies: readonly CurrencyOption[],
): boolean {
  return currencies.some(({ uid }) => {
    const rawValue = draft[uid] ?? String(savedQuantities[uid] ?? 0);
    if (rawValue.trim() === "") return true;
    const quantity = Number(rawValue);
    return !Number.isSafeInteger(quantity) || quantity < 0 || quantity !== (savedQuantities[uid] ?? 0);
  });
}

function readPatch(
  draft: Record<string, string>,
  savedQuantities: Record<string, number>,
  currencies: readonly CurrencyOption[],
): Record<string, number> | null {
  const patch: Record<string, number> = {};
  for (const { uid } of currencies) {
    const rawValue = draft[uid] ?? String(savedQuantities[uid] ?? 0);
    if (rawValue.trim() === "") return null;
    const quantity = Number(rawValue);
    if (!Number.isSafeInteger(quantity) || quantity < 0) return null;
    if (quantity !== (savedQuantities[uid] ?? 0)) patch[uid] = quantity;
  }
  return patch;
}

function isWritableGuestSnapshot(
  snapshot: GuestEventShopPlannerSnapshot,
): snapshot is WritableGuestEventShopPlannerSnapshot {
  return snapshot.status === "ready" || snapshot.status === "memory";
}

function snapshotFailureMessage(snapshot: GuestEventShopPlannerSnapshot): string {
  if (snapshot.status === "conflict") return "다른 탭에서 계획이 바뀌어 저장하지 못했어요. 현재 입력은 유지했어요.";
  if (snapshot.status === "corrupt") return "저장된 게스트 계획을 읽지 못해 저장할 수 없어요. 현재 입력은 유지했어요.";
  return "브라우저 저장소에 접근할 수 없어 저장하지 못했어요. 현재 입력은 유지했어요.";
}

export function PlannerShopOwnedQuantityEditor({
  timelineUid,
  shopStateUid,
  content,
  state,
  defaultState,
  signedIn,
  onSaved,
}: PlannerShopOwnedQuantityEditorProps) {
  const currencies = useMemo(() => getPaymentCurrencies(content), [content]);
  const [savedQuantities, setSavedQuantities] = useState<Record<string, number>>(() => ({
    ...state.existingPaymentItemQuantities,
  }));
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    toDraft(state.existingPaymentItemQuantities, currencies),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const draftDirtyRef = useRef(false);
  const shopPlanKey = `${timelineUid}\u0000${shopStateUid}`;
  const previousShopPlanKeyRef = useRef(shopPlanKey);

  useEffect(() => {
    if (previousShopPlanKeyRef.current !== shopPlanKey) {
      previousShopPlanKeyRef.current = shopPlanKey;
      draftDirtyRef.current = false;
      setSaveError(null);
      setNotice(null);
    }
    if (draftDirtyRef.current) return;
    const nextSaved = { ...state.existingPaymentItemQuantities };
    const nextDraft = toDraft(nextSaved, currencies);
    setSavedQuantities((current) => (recordValuesEqual(current, nextSaved) ? current : nextSaved));
    setDraft((current) => (recordValuesEqual(current, nextDraft) ? current : nextDraft));
  }, [currencies, shopPlanKey, state.existingPaymentItemQuantities]);

  const dirty = hasDraftChanges(draft, savedQuantities, currencies);

  const applySavedState = useCallback(
    (nextState: EventShopState) => {
      const nextSaved = { ...nextState.existingPaymentItemQuantities };
      draftDirtyRef.current = false;
      setSavedQuantities(nextSaved);
      setDraft(toDraft(nextSaved, currencies));
      setSaveError(null);
      onSaved?.(nextState);
    },
    [currencies, onSaved],
  );

  const saveDraft = useCallback(async () => {
    if (!content || isSaving) return;
    const patch = readPatch(draft, savedQuantities, currencies);
    if (!patch) {
      setSaveError("보유 재화는 0 이상의 정수로 입력해주세요.");
      return;
    }
    if (Object.keys(patch).length === 0) return;

    setIsSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      if (signedIn) {
        const response = await fetch(`/api/events/${encodeURIComponent(timelineUid)}/shop-state`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updateOwnedQuantities: patch }),
        });
        const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!response.ok || !result?.success) {
          throw new Error(result?.error ?? "보유 재화를 저장하지 못했어요. 다시 시도해주세요.");
        }
        applySavedState(patchEventShopOwnedQuantities(state, patch));
        setNotice({ tone: "success", message: "보유 재화를 저장했어요." });
        return;
      }

      const snapshot = await updateGuestEventShopPlanner((data) =>
        patchGuestEventShopPlanOwnedQuantities(data, {
          timelineUid,
          shopStateUid,
          defaults: defaultState,
          patch,
        }),
      );
      if (!isWritableGuestSnapshot(snapshot)) {
        throw new Error(snapshotFailureMessage(snapshot));
      }
      const savedPlan = snapshot.envelope.data.plans[shopStateUid];
      if (!savedPlan) throw new Error("게스트 계획을 저장하지 못했어요. 다시 시도해주세요.");

      applySavedState(savedPlan.state);
      if (snapshot.status === "memory") {
        setNotice({
          tone: "warning",
          message: "이 탭에는 저장했지만 브라우저 저장은 완료되지 않았어요.",
          retry: "guest-persistence",
        });
      } else {
        setNotice({ tone: "success", message: "이 브라우저에 보유 재화를 저장했어요." });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "보유 재화를 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }, [
    applySavedState,
    content,
    currencies,
    defaultState,
    draft,
    isSaving,
    savedQuantities,
    shopStateUid,
    signedIn,
    state,
    timelineUid,
  ]);

  const retrySave = useCallback(async () => {
    if (notice?.retry !== "guest-persistence") {
      await saveDraft();
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const snapshot = await retryGuestEventShopPlannerPersistence();
      if (!isWritableGuestSnapshot(snapshot) || snapshot.status === "memory") {
        throw new Error(
          isWritableGuestSnapshot(snapshot)
            ? "브라우저 저장을 다시 완료하지 못했어요."
            : snapshotFailureMessage(snapshot),
        );
      }
      const savedPlan = snapshot.envelope.data.plans[shopStateUid];
      if (savedPlan) applySavedState(savedPlan.state);
      setNotice({ tone: "success", message: "브라우저 저장을 완료했어요." });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "브라우저 저장을 완료하지 못했어요.");
    } finally {
      setIsSaving(false);
    }
  }, [applySavedState, notice?.retry, saveDraft, shopStateUid]);

  const knownCurrencyUids = useMemo(() => new Set(currencies.map(({ uid }) => uid)), [currencies]);
  const unresolvedOwnedValues = Object.entries(state.existingPaymentItemQuantities).filter(
    ([uid, quantity]) => quantity > 0 && !knownCurrencyUids.has(uid),
  );

  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      aria-labelledby="planner-shop-owned-title"
    >
      <div>
        <h3 id="planner-shop-owned-title" className="text-sm font-semibold text-foreground">
          보유 이벤트 재화
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">현재 가진 재화를 입력하면 상점 소탕 계산에 반영돼요.</p>
      </div>

      {!content ? (
        <p className="text-sm text-muted-foreground">이벤트 상점 재화 정보를 확인할 수 없어요.</p>
      ) : currencies.length === 0 ? (
        <p className="text-sm text-muted-foreground">입력할 이벤트 상점 재화가 없어요.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {currencies.map((currency) => (
            <label key={currency.uid} className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 p-2">
              <img
                src={resourceImageUrl(RESOURCE_IMAGE_TYPES[currency.type], currency.uid)}
                alt=""
                className="size-8 shrink-0 object-contain"
                loading="lazy"
              />
              <span className="min-w-0 flex-1 truncate text-sm" title={currency.hasName ? currency.name : undefined}>
                {currency.name}
              </span>
              <input
                aria-label={`${currency.name} 보유 수량`}
                className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm tabular-nums text-foreground"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={draft[currency.uid] ?? String(savedQuantities[currency.uid] ?? 0)}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  draftDirtyRef.current = true;
                  setDraft((current) => ({ ...current, [currency.uid]: value }));
                  setSaveError(null);
                  setNotice(null);
                }}
              />
            </label>
          ))}
        </div>
      )}

      {unresolvedOwnedValues.length > 0 && (
        <p className="text-xs text-muted-foreground">
          이름을 확인할 수 없는 기존 재화 입력 {unresolvedOwnedValues.length}개는 유지되며 이 화면에서 수정할 수 없어요.
        </p>
      )}

      {saveError && <Callout tone="warning" description={saveError} />}
      {notice && <Callout tone={notice.tone} description={notice.message} />}

      <div className="flex justify-end gap-2">
        {saveError || notice?.retry === "guest-persistence" ? (
          <Button
            type="button"
            text={
              isSaving
                ? "다시 저장 중…"
                : notice?.retry === "guest-persistence"
                  ? "브라우저 저장 다시 시도"
                  : "다시 시도"
            }
            size="sm"
            variant="secondary"
            onClick={() => void retrySave()}
            disabled={isSaving || (!dirty && notice?.retry !== "guest-persistence")}
          />
        ) : null}
        <Button
          type="button"
          text={isSaving ? "저장 중…" : "보유 재화 저장"}
          size="sm"
          variant="primary"
          onClick={() => void saveDraft()}
          disabled={!content || !dirty || isSaving}
        />
      </div>
    </section>
  );
}

export default PlannerShopOwnedQuantityEditor;
