import { Link } from "react-router";
import { ItemCard } from "~/components/atoms/item";
import { SubTitle, Callout } from "~/components/atoms/typography";
import { ItemCards } from "~/components/molecules/item";
import { StudentCards } from "~/components/students";
import { useSignIn } from "~/contexts/SignInProvider";
import type { Role } from "~/models/student";

type EventStagesProps = {
  stages: {
    difficulty: number;
    index: string;
    entryAp: number | null;
    rewards: {
      amount: number;
      item: {
        itemId: string;
        name: string;
        imageId: string;
        eventBonuses: {
          student: {
            uid: string;
            role: Role;
          };
          ratio: number;
        }[];
      };
    }[];
  }[];
  signedIn: boolean;
  ownedStudentUids: string[];
}

export default function EventStages({ stages, signedIn, ownedStudentUids }: EventStagesProps) {
  const { showSignIn } = useSignIn();

  const itemBonuses: {
    [itemId: string]: {
      item: EventStagesProps["stages"][number]["rewards"][number]["item"],
      ratio: number,
      maxRatio: number,
    },
  } = {};
  for (const reward of stages.flatMap((stage) => stage.rewards)) {
    const { item, amount } = reward;
    if (itemBonuses[item.itemId] || amount < 1) {
      continue;
    }

    let appliedRatio = 0, maxApplieRatio = 0;
    let appliedStriker = 0, appliedSpecial = 0, maxAppliedStriker = 0, maxAppliedSpecial = 0;
    for (const { student, ratio } of reward.item.eventBonuses.sort((a, b) => b.ratio - a.ratio)) {
      const owned = ownedStudentUids.includes(student.uid);
      if (student.role === "striker") {
        if (maxAppliedStriker < 4) {
          maxAppliedStriker += 1;
          maxApplieRatio += ratio * 100;
        }

        if (owned && appliedStriker < 4) {
          appliedStriker += 1;
          appliedRatio += ratio * 100;
        }
      } else if (student.role === "special") {
        if (maxAppliedSpecial < 2) {
          maxAppliedSpecial += 1;
          maxApplieRatio += ratio * 100;
        }

        if (owned && appliedSpecial < 2) {
          appliedSpecial += 1;
          appliedRatio += ratio * 100;
        }
      }

      if (appliedStriker === 4 && appliedSpecial === 2) {
        break;
      }
    }

    itemBonuses[item.itemId] = { item, ratio: appliedRatio / 100, maxRatio: maxApplieRatio / 100 };
  }

  return (
    <>
      <SubTitle text="스테이지 보상" />
      {signedIn && ownedStudentUids.length === 0 && (
        <Callout className="my-4" emoji="✨">
          <span>
            <Link to="/edit/students" className="underline">보유 학생 정보를 등록</Link>하면 내 학생 보너스를 계산할 수 있어요.
          </span>
        </Callout>
      )}
      <div className="w-screen -mx-4 md:w-auto overflow-x-scroll no-scrollbar">
        <div className="px-4">
          <table className="table-auto">
            <thead className="bg-neutral-100 dark:bg-neutral-900 text-left">
              <tr>
                <th className="px-2 md:px-4 py-2 rounded-l-lg">#</th>
                <th className="p-2 whitespace-nowrap">AP</th>
                <th className="p-2 w-full">보상</th>
                <th className="px-2 md:px-4 py-2 whitespace-nowrap rounded-r-lg">AP 효율</th>
              </tr>
            </thead>
            <tbody>
              {stages.filter((stage) => (stage.difficulty == 1)).map((stage) => {
                const eventRewards = stage.rewards.filter((reward) => reward.amount >= 1);
                const items: { name: string, imageId: string, amount: number, bonus: boolean }[] = [];
                for (const { item, amount } of eventRewards) {
                  items.push({ name: item.name, imageId: item.imageId, amount, bonus: false });
                }
                for (const { item, amount } of eventRewards) {
                  if (itemBonuses[item.itemId] && itemBonuses[item.itemId].ratio > 0) {
                    const bonusAmount = Math.ceil(amount * itemBonuses[item.itemId].ratio);
                    items.push({ name: item.name, imageId: item.imageId, amount: bonusAmount, bonus: true });
                  }
                }

                return (
                  <tr key={`event-stage-${stage.index}`} className="py-2 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition">
                    <td className="px-2 md:px-4 py-2 font-bold rounded-l-lg">{stage.index}</td>
                    <td>
                      <ItemCard name="AP" imageId="currency_icon_ap" label={(stage.entryAp || 0).toString()} />
                    </td>
                    <td className="p-2">
                      <ItemCards itemProps={items.map((item) => ({
                        name: item.name,
                        imageId: item.imageId,
                        label: item.amount.toString(),
                        labelClassName: item.bonus ? "text-orange-300" : undefined,
                      }))} />
                    </td>
                    <td className="px-2 md:px-4 py-2 rounded-r-lg">
                      {(1.0 * (items.map(({ amount }) => amount).reduce((a, b) => a + b)) / (stage.entryAp || 1)).toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SubTitle text="이벤트 아이템" />
      <div>
        {Object.keys(itemBonuses).map((itemId) => {
          const { item, ratio, maxRatio } = itemBonuses[itemId];
          return (
            <div key={`item-bonus-${itemId}`} className="my-4">
              <div className="px-4 py-2 flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-lg">
                <div>
                  <ItemCard name={item.name} imageId={item.imageId} />
                </div>
                <div className="p-2">
                  <p className="font-bold">{item.name}</p>
                  {item.eventBonuses.length > 0 && (
                    <p className="text-sm text-neutral-500">
                      모집 학생 보너스{signedIn ? ` +${Math.round(ratio * 100)}% (최대 +${Math.round(maxRatio * 100)}%)` : "는 로그인 후 확인 가능"}
                    </p>
                  )}
                </div>
              </div>

              {item.eventBonuses.length === 0 ?
                <p className="my-8 text-center">모집 학생 보너스가 없어요</p> : (
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-1/2 p-2">
                    <p className="mb-2 font-bold">스트라이커</p>
                    <StudentCards mobileGrid={8} pcGrid={6} students={item.eventBonuses.filter(({ student }) => student.role === "striker").map(({ student, ratio }) => ({
                      uid: student.uid,
                      grayscale: signedIn && !ownedStudentUids.includes(student.uid),
                      label: (<span className="text-white font-normal">{Math.round(ratio * 100)}%</span>),
                    }))} />
                  </div>
                  <div className="w-full md:w-1/2 p-2">
                    <p className="mb-2 font-bold">스페셜</p>
                    <StudentCards mobileGrid={8} pcGrid={6} students={item.eventBonuses.filter(({ student }) => student.role === "special").map(({ student, ratio }) => ({
                      uid: student.uid,
                      grayscale: signedIn && !ownedStudentUids.includes(student.uid),
                      label: (<span className="text-white font-normal">{Math.round(ratio * 100)}%</span>),
                    }))} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  );
}