import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/16/solid";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { type StudentStateExportFormat, serializeStudentStateExport } from "~/domain/student-state-serialization";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { cn } from "~/lib/utils";
import { getConnectExportData } from "~/views/connect-export.server";
import { ConnectStateMessage } from "./connect._components/ConnectStateMessage";
import { ConnectScreenLayout } from "./connect._components/connect-navigation";

export const meta: MetaFunction = () => [{ title: "데이터 내보내기 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  return getConnectExportData(env, sensei.id);
};

export default function ConnectExportIndexPage() {
  const { recruitedStudents, studentGrowths, relationshipLevels, studentCatalog } = useLoaderData<typeof loader>();
  const [selectedFormat, setSelectedFormat] = useState<StudentStateExportFormat>("schaledb");
  const [exportedText, setExportedText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportTimerRef = useRef<number | null>(null);
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

  useEffect(
    () => () => {
      if (exportTimerRef.current !== null) window.clearTimeout(exportTimerRef.current);
    },
    [],
  );

  const handleFormatChange = (format: StudentStateExportFormat) => {
    if (exportTimerRef.current !== null) window.clearTimeout(exportTimerRef.current);
    exportTimerRef.current = null;
    setSelectedFormat(format);
    setExportedText("");
    setExporting(false);
    setCopied(false);
  };

  const handleExport = () => {
    if (!hasSelectedData) {
      setExportedText("");
      return;
    }

    // Serializing a large account takes a moment, so the button shows its progress before the work starts.
    setExporting(true);
    setCopied(false);
    exportTimerRef.current = window.setTimeout(() => {
      exportTimerRef.current = null;
      setExportedText(serializeStudentStateExport(exportInput, selectedFormat));
      setExporting(false);
      trackGoogleAnalyticsEvent("connect_export_requested", { format: selectedFormat });
    }, 0);
  };

  const handleCopy = async () => {
    if (!exportedText || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(exportedText);
    setCopied(true);
  };

  return (
    <ConnectScreenLayout
      current="export"
      title="데이터 내보내기"
      description="현재 SchaleDB와 Justin163 플래너를 지원해요"
    >
      <div className="flex flex-col gap-v2-block-gap">
        <StatusNotice tone="warning" boxed>
          <p className="font-semibold">외부 사이트의 데이터가 유실될 수 있어요</p>
          <p className="mt-0.5 text-sm text-v2-fg-secondary">
            내보낸 데이터를 외부 사이트에 입력하면 해당 사이트의 기존 데이터를 덮어써요. 먼저 해당 사이트의 데이터를
            몰루로그로 가져와서 합친 후 다시 내보내주세요.
          </p>
        </StatusNotice>

        <section className="flex flex-col gap-3 rounded-lg bg-v2-surface p-v2-block-p">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" aria-labelledby="export-site-label">
              <p id="export-site-label" className="text-sm font-semibold text-v2-fg">
                내보낼 사이트
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleChip
                  pressed={selectedFormat === "schaledb"}
                  onPressedChange={() => handleFormatChange("schaledb")}
                >
                  SchaleDB
                </ToggleChip>
                <ToggleChip
                  pressed={selectedFormat === "justin163"}
                  onPressedChange={() => handleFormatChange("justin163")}
                >
                  Justin163
                </ToggleChip>
              </div>
            </fieldset>
            {hasSelectedData ? (
              <Button type="button" variant="primary" disabled={exporting} onClick={handleExport}>
                {exporting ? "내보내는 중…" : "내보내기"}
              </Button>
            ) : null}
          </div>

          {hasSelectedData ? (
            <>
              <textarea
                readOnly
                aria-label="내보낸 데이터"
                rows={6}
                value={exportedText}
                placeholder="내보내기 버튼을 누르면 이곳에 데이터가 표시돼요"
                className={cn(
                  "min-h-32 w-full resize-y rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 font-mono text-sm text-v2-fg placeholder:text-v2-fg-tertiary focus:border-v2-control-border-strong",
                  v2FocusRing,
                )}
              />
              {exportedText ? (
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={handleCopy}>
                    {copied ? (
                      <CheckIcon className="size-4" aria-hidden="true" />
                    ) : (
                      <ClipboardDocumentIcon className="size-4" aria-hidden="true" />
                    )}
                    {copied ? "복사됨" : "복사하기"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-md bg-v2-inset">
              <ConnectStateMessage
                Icon={ArchiveBoxIcon}
                title="내보낼 데이터가 없어요"
                description="모집한 학생을 등록하면 내보낼 수 있어요."
              />
            </div>
          )}
        </section>
      </div>
    </ConnectScreenLayout>
  );
}
