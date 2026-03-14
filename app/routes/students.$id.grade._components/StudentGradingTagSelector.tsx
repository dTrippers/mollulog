import { TagIcon } from "~/components/primitives";
import { STUDENT_GRADING_TAG_DISPLAY, type StudentGradingTagValue } from "~/models/student-grading-tag";

type StudentGradingTagSelectorProps = {
  selectedTags: StudentGradingTagValue[];
  onToggleTag: (tag: StudentGradingTagValue) => void;
};

export default function StudentGradingTagSelector({ selectedTags, onToggleTag }: StudentGradingTagSelectorProps) {
  return (
    <div className="-mt-4 flex flex-wrap gap-2">
      {Object.entries(STUDENT_GRADING_TAG_DISPLAY).map(([tagValue, displayName]) => {
        const tag = tagValue as StudentGradingTagValue;
        const isSelected = selectedTags.includes(tag);

        return (
          <button
            key={tagValue}
            type="button"
            onClick={() => onToggleTag(tag)}
            className={`px-3 py-2 flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 transition-colors ${
              isSelected
                ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600"
            }`}
          >
            <TagIcon tag={tag} />
            <span className="tracking-tighter shrink-0">{displayName}</span>
          </button>
        );
      })}
    </div>
  );
}
