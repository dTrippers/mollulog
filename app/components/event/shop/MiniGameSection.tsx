import { NumberInput } from "~/components/atoms/form";
import { ResourceCard } from "~/components/atoms/item";
import { Section } from "~/components/ui";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import type { ShopState, ShopActions } from "./hooks";
import { resourceCountLabel } from "./utils";

type MiniGameSectionProps = {
  rewards: { resourceType: ResourceTypeEnum; resourceUid: string; quantity: number; rarity?: number }[];
  state: ShopState;
  actions: ShopActions;
};

export function MiniGameSection({ rewards, state, actions }: MiniGameSectionProps) {
  return (
    <Section
      title="미니 게임"
      description="미니게임 <정의실현부의 끝나지 않은 여름방학>"
      foldable
      foldStateKey="event-shop-section::mini-game"
      defaultExpanded={true}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">플레이 횟수</p>
        <NumberInput value={state.minigamePlayCount} onChange={actions.setMinigamePlayCount} />
      </div>
      <div className="my-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-200 font-medium">획득 보상</p>
        {state.minigamePlayCount > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {rewards.map(({ resourceType, resourceUid, quantity, rarity }) => {
              const totalQuantity = quantity * state.minigamePlayCount;
              return (
                <ResourceCard
                  key={resourceUid}
                  resourceType={resourceType}
                  itemUid={resourceUid}
                  rarity={rarity}
                  label={resourceCountLabel(totalQuantity)}
                />
              );
            })}
          </div>
        ) : (
          <div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">플레이 횟수를 입력해주세요</p>
          </div>
        )}
      </div>

      <p className="my-4 text-sm text-neutral-500 dark:text-neutral-400">
        최종 스테이지(3-7) 클리어를 기준으로 계산돼요
      </p>
    </Section>
  );
}
