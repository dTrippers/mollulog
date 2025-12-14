import dayjs from "dayjs";
import SelectForm, { type SelectFormProps } from "./SelectForm";
import { StudentCards } from "~/components/students";
import { bossImageUrl } from "~/models/assets";

type ContentSelectFormProps = Omit<SelectFormProps, "options"> & {
  contents: {
    uid: string;
    name: string;
    since?: Date;
    until?: Date;
    pickups?: {
      student: { uid: string;} | null;
      studentName: string;
    }[];
    boss?: string;
  }[];
  searchPlaceholder?: string;
  onSelect?: (contentUid: string) => void;
};

export default function ContentSelectForm(props: ContentSelectFormProps) {
  return (
    <SelectForm
      {...props}
      options={props.contents.map((content) => ({
        label: content.name,
        value: content.uid,
        searchLabel: `${content.name} ${content.pickups?.map((pickup) => pickup.studentName).join(" ")}`,
        element: (
          <div className="w-full px-4 py-2 relative">
            <p className="font-semibold">{content.name}</p>
            {content.since && content.until && (
              <p className="text-sm text-neutral-500">
                {dayjs(content.since).format("YYYY.MM.DD")} ~ {dayjs(content.until).format("YYYY.MM.DD")}
              </p>
            )}
            {content.pickups && (
              <div className="mt-2">
                <StudentCards
                  students={content.pickups.filter((pickup) => pickup.student).map((pickup) => pickup.student!)}
                  pcGrid={12} mobileGrid={8}
                />
              </div>
            )}
            {content.boss && (
              <img src={bossImageUrl(content.boss)} alt="raid boss" className="absolute top-0 right-0 h-full" />
            )}
          </div>
        ),
      }))}
      useSearch
      searchPlaceholder={props.searchPlaceholder ?? "이벤트 또는 픽업 학생 이름으로 찾기..."}
    />
  )
}
