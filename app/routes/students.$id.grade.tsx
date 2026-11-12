import { useState } from "react";
import { XCircleIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { GradingTagIcon } from "~/components/v2/features/students/GradingTagIcon";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { getPrimaryStudentUid, getStudentGradeDetail } from "~/models/student";
import { formatStudentFullName } from "~/models/student-name";
import { deleteStudentGrading, getStudentGrading, upsertStudentGrading } from "~/models/student-grading.server";
import { STUDENT_GRADING_TAG_DISPLAY, type StudentGradingTagValue } from "~/models/student-grading-tag";
import { StudentDetailErrorBoundary } from "./students.$id._components/StudentDetailErrorBoundary";

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "students.$id.grade.loader",
    studentUid: params.id,
  });
  const studentUid = params.id;
  if (!studentUid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect(`/students/${studentUid}`);
  }

  let student: Awaited<ReturnType<typeof getStudentGradeDetail>>;
  let gradingStudentUid: string | null;
  try {
    [student, gradingStudentUid] = await Promise.all([
      getStudentGradeDetail(env, studentUid),
      getPrimaryStudentUid(env, studentUid),
    ]);
  } catch (error) {
    logger.error("Failed to load student grading detail", error);
    if (isStudentNotFoundError(error)) {
      throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
    }
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (student === undefined) {
    logger.error("Failed to load student grading detail without response data");
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (!student || !gradingStudentUid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const existingGrading = await getStudentGrading(env, currentUser.id, gradingStudentUid, true);
  return {
    student,
    existingGrading: existingGrading || null,
  };
};

export const action = async ({ params, request, context }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "students.$id.grade.action",
    studentUid: params.id,
  });
  const studentUid = params.id;
  if (!studentUid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect(`/students/${studentUid}`);
  }

  let gradingStudentUid: string | null;
  try {
    gradingStudentUid = await getPrimaryStudentUid(env, studentUid);
  } catch (error) {
    logger.error("Failed to resolve the primary student for grading", error, {
      currentUserId: currentUser.id,
    });
    return { error: "학생 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요" };
  }
  if (!gradingStudentUid) {
    return { error: "존재하지 않는 학생이에요" };
  }

  if (intent === "delete") {
    try {
      await deleteStudentGrading(env, currentUser.id, gradingStudentUid);
      return redirect(`/students/${studentUid}`);
    } catch (error) {
      logger.error("Error deleting grading", error, {
        currentUserId: currentUser.id,
      });
      return { error: "평가를 삭제하는 중 오류가 발생했어요" };
    }
  }

  const comment = formData.get("comment") as string;
  if (comment.length > 100) {
    return { error: "평가 내용은 최대 100자까지 작성할 수 있어요" };
  }

  const selectedTags = formData.getAll("tags") as StudentGradingTagValue[];
  try {
    await upsertStudentGrading(env, currentUser.id, gradingStudentUid, comment || null, selectedTags);
    return redirect(`/students/${studentUid}`);
  } catch (error) {
    logger.error("Error saving grading", error, {
      currentUserId: currentUser.id,
      selectedTagCount: selectedTags.length,
    });
    return { error: "평가를 저장하는 중 오류가 발생했어요" };
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "학생 평가 | 몰루로그" }];
  }

  const { student } = data;
  const studentFullName = formatStudentFullName(student);
  const title = `${studentFullName} - 학생 평가`;
  const description = `블루 아카이브 ${student.name}에 대한 평가를 작성해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const ErrorBoundary = StudentDetailErrorBoundary;

export default function StudentGrade() {
  const { student, existingGrading } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";
  const isDeleting = isSubmitting && navigation.formData?.get("intent") === "delete";
  const isSaving = isSubmitting && !isDeleting;

  const [selectedTags, setSelectedTags] = useState<StudentGradingTagValue[]>(existingGrading?.tags || []);
  const [comment, setComment] = useState(existingGrading?.comment || "");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const toggleTag = (tag: StudentGradingTagValue) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]));
  };

  return (
    <>
      <div className="mb-2 flex min-h-7 items-center"><h2 className="text-base leading-[1.4] font-semibold text-v2-fg" style={{ fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif' }}>학생 평가하기</h2></div>
      <Form method="post" className="rounded-lg bg-v2-surface p-v2-block-p">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor="student-grading-comment" className="text-sm leading-[1.43] font-medium text-v2-fg">
              평가 의견 <span className="font-normal text-v2-fg-tertiary">(선택)</span>
            </label>
            <span aria-live="polite" className="text-xs leading-[1.43] tabular-nums text-v2-fg-tertiary">{comment.length}/100</span>
          </div>
          <textarea
            id="student-grading-comment"
            name="comment"
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            placeholder="평가 내용을 작성해주세요"
            rows={4}
            maxLength={100}
            className="block h-24 min-h-24 w-full resize-y rounded-md border border-v2-control-border bg-v2-surface px-[10px] py-2 text-sm leading-[1.5] text-v2-fg placeholder:text-v2-fg-tertiary focus:border-v2-control-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
          />
        </div>
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-sm leading-[1.43] font-medium text-v2-fg">평가 태그</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STUDENT_GRADING_TAG_DISPLAY).map(([tagValue, displayName]) => {
              const tag = tagValue as StudentGradingTagValue;
              const selected = selectedTags.includes(tag);
              return (
                <ToggleChip key={tag} pressed={selected} onPressedChange={() => toggleTag(tag)}>
                  <span className="inline-flex items-center gap-1">
                    <GradingTagIcon tag={tag} size="sm" />
                    <span>{displayName}</span>
                  </span>
                </ToggleChip>
              );
            })}
          </div>
        </fieldset>
        {selectedTags.map((tag) => <input key={tag} type="hidden" name="tags" value={tag} />)}
        {actionData && "error" in actionData && actionData.error && !deleteDialogOpen ? (
          <StatusNotice className="mt-4 [&>svg]:hidden" tone="danger">
            <span className="relative block pl-6 leading-[1.43]"><XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />{actionData.error}</span>
          </StatusNotice>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <button type="submit" name="intent" value="save" disabled={isSubmitting} className={v2ButtonClassName({ variant: "primary" })}>
            {isSaving ? "저장 중" : existingGrading ? "편집 완료" : "작성 완료"}
          </button>
          <Link to={`/students/${student.uid}`} aria-disabled={isSubmitting} onClick={(event) => { if (isSubmitting) event.preventDefault(); }} className={v2ButtonClassName({ variant: "text" })}>
            취소
          </Link>
          {existingGrading ? (
            <>
              <span className="flex-1" aria-hidden="true" />
              <button type="button" disabled={isSubmitting} onClick={() => setDeleteDialogOpen(true)} className={v2ButtonClassName({ variant: "danger" })}>
                {isDeleting ? "삭제 중" : "삭제"}
              </button>
            </>
          ) : null}
        </div>
      </Form>
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} title="정말 이 평가를 삭제할까요?" size="sm">
        <style>{`
          [role="dialog"]:has([data-student-delete-dialog-marker]) button[aria-label="닫기"] {
            margin-right: 0 !important;
            color: var(--color-v2-fg-secondary) !important;
          }
          [role="dialog"]:has([data-student-delete-dialog-marker]) button[aria-label="닫기"] > svg {
            display: block !important;
            width: 16px !important;
            height: 16px !important;
            opacity: 1 !important;
            visibility: visible !important;
            stroke: currentColor;
          }
        `}</style>
        <span aria-hidden="true" className="hidden" data-student-delete-dialog-marker />
        {actionData && "error" in actionData && actionData.error ? (
          <StatusNotice className="mt-3 [&>svg]:hidden" tone="danger">
            <span className="relative block pl-6 leading-[1.43]"><XCircleIcon className="absolute top-0.5 left-0 size-4 text-v2-danger" aria-hidden="true" />{actionData.error}</span>
          </StatusNotice>
        ) : null}
        <div className="mt-1 flex justify-end gap-1.5">
          <button type="button" onClick={() => setDeleteDialogOpen(false)} className={v2ButtonClassName({ variant: "secondary" })}>취소</button>
          <button type="button" disabled={isSubmitting} onClick={() => submit({ intent: "delete" }, { method: "post" })} className={v2ButtonClassName({ variant: "danger" })}>
            삭제
          </button>
        </div>
      </Dialog>
    </>
  );
}
