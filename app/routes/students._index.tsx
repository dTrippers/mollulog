import { SparklesIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { StudentCards } from "~/components/features/students";
import { Callout } from "~/components/primitives";
import type { StudentsPageContext } from "./students";

const studentCatalogUpdateCalloutDismissalStorageKey = "students::dismissed-catalog-update-2026-07";

export default function Students() {
  const { students } = useOutletContext<StudentsPageContext>();
  const navigate = useNavigate();
  const [calloutLoaded, setCalloutLoaded] = useState(false);
  const [calloutDismissed, setCalloutDismissed] = useState(false);

  useEffect(() => {
    try {
      setCalloutDismissed(localStorage.getItem(studentCatalogUpdateCalloutDismissalStorageKey) === "true");
    } catch {
      // Keep the callout usable when browser storage is unavailable.
    } finally {
      setCalloutLoaded(true);
    }
  }, []);

  const dismissCallout = () => {
    setCalloutDismissed(true);
    try {
      localStorage.setItem(studentCatalogUpdateCalloutDismissalStorageKey, "true");
    } catch {
      // Dismissing for the current page is sufficient when browser storage is unavailable.
    }
  };

  return (
    <>
      {calloutLoaded && !calloutDismissed ? (
        <div className="relative mb-3 md:mb-4">
          <Callout
            tone="info"
            Icon={SparklesIcon}
            title="학생부에 다양한 정보가 추가됐어요"
            description="학생 프로필, 스킬, 스탯, 성장도 별 능력치 등을 각 학생별 화면에서 확인해보세요"
            className="pr-11"
          />
          <button
            type="button"
            onClick={dismissCallout}
            aria-label="학생부 업데이트 안내 닫기"
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <XMarkIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <StudentCards
        students={students}
        layout="responsive-wrap"
        cardSize="lg"
        onSelect={(uid) => navigate(`/students/${uid}`)}
      />
    </>
  );
}
