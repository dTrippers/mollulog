import { BottomSheet } from "~/components/primitives";

const methodGroups = [
  {
    title: "기본 계산에 포함하는 AP",
    items: [
      "6분마다 1 AP (계정 레벨에 따른 최대 보유 AP량까지)",
      "카페 1호점 생산 AP (카페 쾌적도에 따른 최대 보유 AP량까지)",
      "일일 미션 (150 AP)",
    ],
  },
  {
    title: "플레이 조건에 따라 포함하는 AP",
    items: ["청휘석을 이용한 AP 충전", "전술 대회 코인을 이용한 AP 충전", "2주 AP 패키지 구매"],
  },
  {
    title: "AP 모으기 계산 방법",
    items: ["이벤트 개최 하루 전에 AP를 모두 사용하고 그 뒤로 모으는 상황을 가정하여 계산해요."],
  },
] as const;

export default function ApCalculationMethodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <BottomSheet title="계산 방식" fitContent onClose={onClose}>
      <div className="space-y-5 break-keep pb-4 text-sm">
        {methodGroups.map((group) => (
          <section key={group.title} className="space-y-1">
            <h3 className="font-semibold text-foreground">{group.title}</h3>
            <ul className="space-y-1 text-muted-foreground">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </BottomSheet>
  );
}
