import { CheckCircleIcon } from "@heroicons/react/20/solid";
import { ClipboardDocumentIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, Callout, FilterButtons, SubTitle, Textarea } from "~/components/primitives";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRelationshipLevels } from "~/models/relationship-level";
import { getAllStudents } from "~/models/student";
import { getStudentGrowths } from "~/models/student-growth";
import { type StudentStateExportFormat, serializeStudentStateExport } from "~/domain/student-state-serialization";
import { listPendingSyncDrafts } from "~/models/sync-draft";
import ConnectDataPage from "./connect._components/ConnectDataPage";

export const meta: MetaFunction = () => [{ title: "데이터 내보내기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const [pendingDrafts, recruitedStudents, studentGrowths, relationshipLevels, allStudents] = await Promise.all([
    listPendingSyncDrafts(env, sensei.id),
    getRecruitedStudents(env, sensei.id),
    getStudentGrowths(env, sensei.id),
    getRelationshipLevels(env, sensei.id),
    getAllStudents(env, true),
  ]);

  const studentCatalog = Object.fromEntries(
    allStudents.map((student) => [student.uid, { name: student.name, order: student.order }]),
  );

  return {
    pendingDraftCount: pendingDrafts.length,
    recruitedStudents,
    studentGrowths,
    relationshipLevels,
    studentCatalog,
  };
};

export default function ConnectExportIndexPage() {
  const { pendingDraftCount, recruitedStudents, studentGrowths, relationshipLevels, studentCatalog } =
    useLoaderData<typeof loader>();
  const [selectedFormat, setSelectedFormat] = useState<StudentStateExportFormat>("schaledb");
  const [exportedText, setExportedText] = useState("");
  const [copied, setCopied] = useState(false);
  const exportInput = useMemo(
    () => ({ recruitedStudents, studentGrowths, relationshipLevels, studentCatalog }),
    [recruitedStudents, studentGrowths, relationshipLevels, studentCatalog],
  );
  const hasSchaleDbData = recruitedStudents.length > 0;
  const hasJustin163Data = recruitedStudents.length > 0 || studentGrowths.length > 0 || relationshipLevels.length > 0;
  const hasSelectedData = selectedFormat === "schaledb" ? hasSchaleDbData : hasJustin163Data;

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  const handleFormatChange = (format: StudentStateExportFormat) => {
    setSelectedFormat(format);
    setExportedText("");
    setCopied(false);
  };

  const handleExport = () => {
    if (!hasSelectedData) {
      setExportedText("");
      return;
    }

    setExportedText(serializeStudentStateExport(exportInput, selectedFormat));
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!exportedText || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(exportedText);
    setCopied(true);
  };

  return (
    <ConnectDataPage currentScreen="export" pendingDraftCount={pendingDraftCount}>
      <div className="space-y-8 pb-12">
        <section>
          <SubTitle text="데이터 내보내기" description="현재 SchaleDB와 Justin163 플래너를 지원해요" />

          <div className="space-y-4">
            <Callout
              tone="warning"
              Icon={ExclamationTriangleIcon}
              title="외부 사이트의 데이터가 유실될 수 있어요"
              description="내보낸 데이터를 외부 사이트에 입력하면 해당 사이트의 기존 데이터가 덮어씌워져요. 먼저 해당 사이트의 데이터를 몰루로그로 가져와서 합친 후 다시 내보내주세요."
            />

            <div>
              <p className="text-sm font-medium text-foreground">내보낼 사이트</p>
              <FilterButtons
                exclusive
                atLeastOne
                buttonProps={[
                  {
                    text: "SchaleDB",
                    active: selectedFormat === "schaledb",
                    onToggle: (activated) => {
                      if (activated) {
                        handleFormatChange("schaledb");
                      }
                    },
                  },
                  {
                    text: "Justin163",
                    active: selectedFormat === "justin163",
                    onToggle: (activated) => {
                      if (activated) {
                        handleFormatChange("justin163");
                      }
                    },
                  },
                ]}
              />
              {!hasSelectedData ? (
                <p className="text-sm text-muted-foreground">선택한 형식으로 내보낼 학생 데이터가 없어요.</p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="primary" disabled={!hasSelectedData} onClick={handleExport}>
                내보내기
              </Button>
            </div>

            <Textarea
              readOnly
              rows={14}
              value={exportedText}
              placeholder="내보내기 버튼을 누르면 이곳에 데이터가 표시돼요"
            />

            <div className="flex justify-end">
              <Button type="button" variant="secondary" disabled={!exportedText} onClick={handleCopy}>
                {copied ? <CheckCircleIcon className="size-4" /> : <ClipboardDocumentIcon className="size-4" />}
                {copied ? "복사됨" : "복사하기"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </ConnectDataPage>
  );
}
