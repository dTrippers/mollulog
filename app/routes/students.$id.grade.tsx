import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { createPageErrorBoundary } from "~/components/features/layout";
import { Button, SubTitle, Textarea } from "~/components/primitives";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { formatStudentFullName } from "~/models/student";
import { deleteStudentGrading, getStudentGrading, upsertStudentGrading } from "~/models/student-grading";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";
import StudentGradingTagSelector from "./students.$id.grade._components/StudentGradingTagSelector";

const studentDetailQuery = graphql(`
  query StudentGradeDetail($uid: String!) {
    student(uid: $uid) {
      name familyName uid attackType defenseType role school schaleDbId
    }
  }
`);

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

  const { data, error } = await runQuery(studentDetailQuery, {
    uid: studentUid,
  });
  if (error) {
    logger.error("Failed to load student grading detail", error);
    if (isStudentNotFoundError(error)) {
      throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
    }
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (!data) {
    logger.error("Failed to load student grading detail without response data");
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  const existingGrading = await getStudentGrading(env, currentUser.id, studentUid, true);
  const student = data.student;
  if (!student) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
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

  if (intent === "delete") {
    try {
      await deleteStudentGrading(env, currentUser.id, studentUid);
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
    await upsertStudentGrading(env, currentUser.id, studentUid, comment || null, selectedTags);
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
  const description = `블루 아카이브 ${studentFullName}에 대한 평가를 작성해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const ErrorBoundary = createPageErrorBoundary({
  title: "학생부",
  description: "학생들의 통계 정보와 선생님들의 평가를 확인해보세요",
  backward: { title: "학생 목록", to: "/students" },
});

export default function StudentGrade() {
  const { student, existingGrading } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";
  const isDeleting = isSubmitting && navigation.formData?.get("intent") === "delete";
  const isSaving = isSubmitting && !isDeleting;

  const [selectedTags, setSelectedTags] = useState<StudentGradingTagValue[]>(existingGrading?.tags || []);

  const toggleTag = (tag: StudentGradingTagValue) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]));
  };

  return (
    <>
      <Form method="post" className="space-y-6">
        <SubTitle text="학생 평가하기" description="최대 100자까지 작성할 수 있어요" />

        <Textarea
          name="comment"
          defaultValue={existingGrading?.comment || ""}
          placeholder="평가 내용을 작성해주세요 (선택)"
          rows={3}
        />

        <StudentGradingTagSelector selectedTags={selectedTags} onToggleTag={toggleTag} />

        {selectedTags.map((tag) => (
          <input key={tag} type="hidden" name="tags" value={tag} />
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            name="intent"
            value="save"
            text={isSaving ? "저장 중..." : existingGrading ? "편집 완료" : "작성 완료"}
            disabled={isSubmitting}
          />
          <Link to={`/students/${student.uid}`} className="shrink-0">
            <Button type="button" text="취소" disabled={isSubmitting} />
          </Link>
          {existingGrading && (
            <Button
              type="button"
              variant="danger"
              text={isDeleting ? "삭제 중..." : "삭제"}
              disabled={isSubmitting}
              onClick={() => {
                if (confirm("정말 이 평가를 삭제할까요?")) {
                  submit({ intent: "delete" }, { method: "post" });
                }
              }}
            />
          )}
        </div>
        {actionData?.error && <p className="text-sm text-red-500 -mt-4">{actionData.error}</p>}
      </Form>
    </>
  );
}
