import dayjs from "dayjs";
import { StudentCards } from "~/components/features/students";
import { bossImageUrl } from "~/models/assets";
import SelectForm, { type SelectFormProps } from "./SelectForm";

type ContentSelectFormProps = Omit<SelectFormProps, "options"> & {
  contents: {
    uid: string;
    name: string;
    since?: Date;
    until?: Date;
    recruitments?: {
      student: {
        uid: string;
        name: string;
      } | null;
      pickup: boolean;
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
        searchLabel: `${content.name} ${content.recruitments?.map((recruitment) => recruitment.student?.name).join(" ")}`,
        element: (
          <div className="relative w-full px-4 py-2">
            <p className="font-semibold">{content.name}</p>
            {content.since && content.until && (
              <p className="text-sm text-neutral-500">
                {dayjs(content.since).format("YYYY.MM.DD")} ~ {dayjs(content.until).format("YYYY.MM.DD")}
              </p>
            )}
            {content.recruitments && (
              <div className="mt-2">
                <StudentCards
                  students={content.recruitments
                    .filter(({ pickup }) => pickup)
                    .slice(0, 8)
                    .map(({ student }) => ({ uid: student?.uid ?? null }))}
                  pcGrid={12}
                  mobileGrid={8}
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
  );
}
