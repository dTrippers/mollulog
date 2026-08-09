import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { useMemo, useState } from "react";
import { Checkbox, NumberInput, ResourceCard, Section } from "~/components/primitives";
import type { MinigameConfig } from "~/domain/event-shop";
import { minigameDescription } from "~/locales/ko";
import {
  type ClueSearchExchange,
  convertClueSearchCostsToPoints,
  getClueSearchExchangeRates,
  getClueSearchRoundDetails,
  normalizeClueSearchRoundRange,
} from "./clue-search";
import type { ShopActions, ShopState } from "./hooks";
import { calculateMinigamePaymentCosts, calculateMinigameRewards, resourceCountLabel } from "./utils";

type ClueSearchSectionProps = {
  config: MinigameConfig;
  state: ShopState;
  actions: ShopActions;
  exchange: ClueSearchExchange | null;
};

export function ClueSearchSection({ config, state, actions, exchange }: ClueSearchSectionProps) {
  const range = normalizeClueSearchRoundRange(state.minigameStartRound, state.minigamePlayCount);
  const [showCompletedRound, setShowCompletedRound] = useState(range.startRound > 1);
  const [showRoundDetails, setShowRoundDetails] = useState(false);
  const roundDetails = useMemo(
    () => getClueSearchRoundDetails(config, range.startRound, range.endRound),
    [config, range.startRound, range.endRound],
  );
  const clueCosts = useMemo(
    () => calculateMinigamePaymentCosts(config, range.endRound, state.minigamePaymentQuantityMode, range.startRound),
    [config, range.endRound, range.startRound, state.minigamePaymentQuantityMode],
  );
  const pointCosts = useMemo(() => convertClueSearchCostsToPoints(clueCosts, exchange), [clueCosts, exchange]);
  const totalClueCount = useMemo(() => clueCosts.reduce((total, cost) => total + cost.quantity, 0), [clueCosts]);
  const exchangePointResource = exchange?.supported ? exchange.pointResource : undefined;
  const exchangeRates = useMemo(() => getClueSearchExchangeRates(exchange), [exchange]);
  const rewards = useMemo(
    () => calculateMinigameRewards(config, range.endRound, range.startRound),
    [config, range.endRound, range.startRound],
  );

  const handleTargetRoundChange = (round: number) => {
    actions.setMinigamePlayCount(round);
    if (round === 0 || state.minigameStartRound > round) {
      actions.setMinigameStartRound(Math.max(1, round));
    }
  };

  const handleCompletedRoundToggle = (checked: boolean) => {
    setShowCompletedRound(checked);
    if (!checked) {
      actions.setMinigameStartRound(1);
    }
  };

  return (
    <Section
      title="단서 찾기"
      description={minigameDescription(config.minigameType) ?? undefined}
      collapsible
      persistenceKey="event-shop-section::mini-game"
      defaultExpanded={true}
    >
      {!exchange?.supported && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          단서 교환 정보를 확인할 수 없어 이벤트 포인트 환산을 지원하지 않아요. 일반 상점 교환은 그대로 표시합니다.
          {exchange?.reason ? ` ${exchange.reason}` : ""}
        </div>
      )}

      {exchange?.supported && exchangePointResource && exchangeRates.length > 0 && (
        <div className="mt-4 rounded-md bg-muted p-3">
          <p className="text-sm font-semibold text-foreground">단서 교환에 필요한 포인트</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {exchangeRates.map((rate) => (
              <div
                key={`${rate.pointAmount}:${rate.clueAmount}`}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <ResourceCard
                  resourceType={exchangePointResource.type}
                  itemUid={exchangePointResource.uid}
                  label={resourceCountLabel(rate.pointAmount)}
                  name={exchangePointResource.name}
                />
                <span>당 단서 {rate.clueAmount.toLocaleString()}개</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-foreground">목표 회차</span>
        <div className="w-32">
          <NumberInput value={state.minigamePlayCount} minValue={0} onChange={handleTargetRoundChange} />
        </div>
        <Checkbox label="완료한 회차 제외" checked={showCompletedRound} onChange={handleCompletedRoundToggle} />
      </div>

      {showCompletedRound && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium text-foreground">완료 회차</span>
          <div className="w-32">
            <NumberInput
              value={Math.max(0, range.startRound - 1)}
              minValue={0}
              maxValue={Math.max(0, range.endRound - 1)}
              onChange={(round) => actions.setMinigameStartRound(round + 1)}
            />
          </div>
          <p className="text-sm text-muted-foreground">완료한 다음 회차부터 계산해요</p>
        </div>
      )}

      <div className="mt-4 rounded-md bg-card p-3">
        <p className="text-sm font-semibold text-foreground">필요 재화</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">단서 {totalClueCount.toLocaleString()}개</p>
            {clueCosts.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {clueCosts.map(({ resourceType, resourceUid, resourceName, quantity }) => (
                  <ResourceCard
                    key={`${resourceType}:${resourceUid}`}
                    resourceType={resourceType}
                    itemUid={resourceUid}
                    label={resourceCountLabel(quantity)}
                    name={resourceName}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">선택한 회차가 없어요</p>
            )}
          </div>

          {exchange?.supported && pointCosts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">이벤트 포인트</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {pointCosts.map(({ resourceType, resourceUid, resourceName, quantity }) => (
                  <ResourceCard
                    key={`${resourceType}:${resourceUid}`}
                    resourceType={resourceType}
                    itemUid={resourceUid}
                    label={resourceCountLabel(quantity)}
                    name={resourceName}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md bg-card p-3">
        <button
          type="button"
          className="-m-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted"
          aria-expanded={showRoundDetails}
          onClick={() => setShowRoundDetails((current) => !current)}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-sm font-semibold text-foreground">회차별 단서 및 보상</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {roundDetails.length > 0
                ? range.startRound === range.endRound
                  ? `${range.startRound}회차`
                  : `${range.startRound}~${range.endRound}회차`
                : "선택한 회차 없음"}
            </span>
          </span>
          <ChevronDownIcon
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${showRoundDetails ? "rotate-180" : ""}`}
          />
        </button>
        {showRoundDetails &&
          (roundDetails.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {roundDetails.map((detail) => (
                <div
                  key={`${detail.round}:${detail.loopCount ?? 1}`}
                  className="flex flex-col gap-1.5 rounded-md bg-muted p-2 sm:flex-row sm:items-start"
                >
                  <span className="shrink-0 text-sm font-semibold text-foreground sm:w-20">
                    {detail.loopCount === undefined
                      ? `${detail.round}회차`
                      : `${detail.round}회차 이후 ×${detail.loopCount.toLocaleString()}`}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="space-y-1">
                      <span className="block text-xs font-medium text-muted-foreground">필요 단서</span>
                      <div className="flex flex-wrap gap-1">
                        {detail.clues.length > 0 ? (
                          detail.clues.map(({ resourceType, resourceUid, resourceName, quantity }) => (
                            <ResourceCard
                              key={`${detail.round}:clue:${resourceType}:${resourceUid}`}
                              resourceType={resourceType}
                              itemUid={resourceUid}
                              label={resourceCountLabel(quantity)}
                              name={resourceName}
                            />
                          ))
                        ) : (
                          <span className="pt-1 text-xs text-muted-foreground">단서 정보 없음</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs font-medium text-muted-foreground">획득 보상</span>
                      <div className="flex flex-wrap gap-1">
                        {detail.rewards.length > 0 ? (
                          detail.rewards.map(({ resourceType, resourceUid, resourceName, quantity, rarity }) => (
                            <ResourceCard
                              key={`${detail.round}:reward:${resourceType}:${resourceUid}:${rarity ?? ""}`}
                              resourceType={resourceType}
                              itemUid={resourceUid}
                              rarity={rarity}
                              label={resourceCountLabel(quantity)}
                              name={resourceName}
                            />
                          ))
                        ) : (
                          <span className="pt-1 text-xs text-muted-foreground">보상 정보 없음</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">목표 회차를 선택해주세요</p>
          ))}
      </div>

      <div className="mt-4 rounded-md bg-card p-3">
        <p className="text-sm font-semibold text-foreground">총 획득 보상</p>
        {rewards.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {rewards.map(({ resourceType, resourceUid, resourceName, quantity, rarity }) => (
              <ResourceCard
                key={`${resourceType}:${resourceUid}:${rarity ?? ""}`}
                resourceType={resourceType}
                itemUid={resourceUid}
                rarity={rarity}
                label={resourceCountLabel(quantity)}
                name={resourceName}
              />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">목표 회차를 선택해주세요</p>
        )}
      </div>
    </Section>
  );
}
