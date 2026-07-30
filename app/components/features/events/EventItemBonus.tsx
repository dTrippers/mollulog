import Decimal from "decimal.js";
import { StudentCards } from "~/components/features/students";
import { itemImageUrl } from "~/models/assets";

type EventItemBonusProps = {
  itemUid: string;
  itemName: string;
  appliedRatio: Decimal;
  maxRatio: Decimal;
  rewardBonuses: {
    ratio: string;
    student: {
      uid: string;
      name: string;
      role: string;
    };
  }[];

  selectedBonusStudentUids: string[];
  setSelectedBonusStudentUid?: (studentUid: string) => void;
  signedIn: boolean;
};

export default function EventItemBonus({
  itemUid,
  itemName,
  appliedRatio,
  maxRatio,
  rewardBonuses,
  selectedBonusStudentUids,
  setSelectedBonusStudentUid,
  signedIn,
}: EventItemBonusProps) {
  const studentsForRole = (role: "striker" | "special") =>
    [...rewardBonuses]
      .sort((a, b) => Number(b.ratio) - Number(a.ratio))
      .filter(({ student }) => student.role === role)
      .map(({ student, ratio }) => ({
        name: student.name,
        uid: student.uid,
        grayscale: signedIn ? !selectedBonusStudentUids.includes(student.uid) : false,
        checked: setSelectedBonusStudentUid ? selectedBonusStudentUids.includes(student.uid) : false,
        label: <span className="font-normal text-white">{new Decimal(ratio).mul(100).toFixed(0)}%</span>,
        labelPlacement: "top-right" as const,
        selectionStyle: "ring" as const,
      }));

  return (
    <section key={itemUid}>
      <div className="flex items-center gap-2">
        <img src={itemImageUrl(itemUid)} alt={itemName} className="size-8 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{itemName}</h3>
          {!signedIn && (
            <p className="text-xs text-muted-foreground">
              로그인 후 모집한 학생을 등록하면 적용 보너스를 확인할 수 있어요
            </p>
          )}
        </div>
        {signedIn && (
          <p className="shrink-0 text-sm tabular-nums">
            <span className="font-medium">적용 {appliedRatio.mul(100).toFixed(0)}%</span>
            <span className="text-muted-foreground"> / 최대 {maxRatio.mul(100).toFixed(0)}%</span>
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <p className="text-sm font-medium sm:w-20 sm:shrink-0">스트라이커</p>
          <div className="min-w-0 flex-1">
            <StudentCards
              mobileGrid={8}
              layout="responsive-wrap"
              cardSize="xs"
              gap="tight"
              namePlacement="overlay"
              hideNameOnMobile
              students={studentsForRole("striker")}
              onSelect={setSelectedBonusStudentUid}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <p className="text-sm font-medium sm:w-20 sm:shrink-0">스페셜</p>
          <div className="min-w-0 flex-1">
            <StudentCards
              mobileGrid={8}
              layout="responsive-wrap"
              cardSize="xs"
              gap="tight"
              namePlacement="overlay"
              hideNameOnMobile
              students={studentsForRole("special")}
              onSelect={setSelectedBonusStudentUid}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
