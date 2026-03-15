import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  Form,
  Link,
  isRouteErrorResponse,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ErrorPage } from "~/components/features/layout";
import { Button, SubTitle, Textarea } from "~/components/primitives";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { getStudentGrading, upsertStudentGrading } from "~/models/student-grading";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";
import StudentGradingTagSelector from "./students.$id.grade._components/StudentGradingTagSelector";

const studentDetailQuery = graphql(`
  query StudentGradeDetail($uid: String!) {
    student(uid: $uid) {
      name uid attackType defenseType role school schaleDbId
    }
  }
`);

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const studentUid = params.id;
  if (!studentUid) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect(`/students/${studentUid}`);
  }

  const { data, error } = await runQuery(studentDetailQuery, {
    uid: studentUid,
  });
  let errorMessage: string | null = null;
  if (error || !data) {
    console.error(error);
    errorMessage = "학생 정보를 가져오는 중 오류가 발생했어요";
  } else if (!data.student) {
    errorMessage = "학생 정보를 찾을 수 없어요";
  }

  if (errorMessage) {
    throw new Response(JSON.stringify({ error: { message: errorMessage } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get existing grading if any
  const existingGrading = await getStudentGrading(env, currentUser.id, studentUid, true);
  const student = data?.student;
  if (!student) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return {
    student,
    existingGrading: existingGrading || null,
  };
};

export const action = async ({ params, request, context }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const comment = formData.get("comment") as string;
  if (comment.length > 100) {
    return { error: "평가 내용은 최대 100자까지 작성할 수 있어요" };
  }

  const { env } = context.cloudflare;
  const studentUid = params.id;
  if (!studentUid) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect(`/students/${studentUid}`);
  }

  const selectedTags = formData.getAll("tags") as StudentGradingTagValue[];
  try {
    await upsertStudentGrading(env, currentUser.id, studentUid, comment || null, selectedTags);
    return redirect(`/students/${studentUid}`);
  } catch (error) {
    console.error("Error saving grading:", error);
    return { error: "평가를 저장하는 중 오류가 발생했어요" };
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "학생 평가 | 몰루로그" }];
  }

  const { student } = data;
  const title = `${student.name} - 학생 평가`;
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

export const ErrorBoundary = () => {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      return <ErrorPage message="로그인이 필요해요" />;
    }
    return <ErrorPage message={error.data.error.message} />;
  }
  return <ErrorPage />;
};

export default function StudentGrade() {
  const { student, existingGrading } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedTags, setSelectedTags] = useState<StudentGradingTagValue[]>(existingGrading?.tags || []);

  const toggleTag = (tag: StudentGradingTagValue) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]));
  };

  return (
    <>
      <Form method="post" className="space-y-6">
        <SubTitle text="학생 평가하기" description="최대 100자까지 작성할 수 있어요" />

        {/* Comment Section */}
        <Textarea
          name="comment"
          defaultValue={existingGrading?.comment || ""}
          placeholder="평가 내용을 작성해주세요 (선택)"
          rows={3}
        />

        {/* Tags Section */}
        <StudentGradingTagSelector selectedTags={selectedTags} onToggleTag={toggleTag} />

        {/* Hidden inputs for selected tags */}
        {selectedTags.map((tag) => (
          <input key={tag} type="hidden" name="tags" value={tag} />
        ))}

        {/* Submit Button */}
        <div className="flex">
          <Button
            type="submit"
            variant="primary"
            text={isSubmitting ? "저장 중..." : existingGrading ? "편집 완료" : "작성 완료"}
          />
          <Link to={`/students/${student.uid}`}>
            <Button type="button" text="취소" />
          </Link>
        </div>
        {actionData?.error && <p className="text-sm text-red-500 -mt-4">{actionData.error}</p>}
      </Form>
    </>
  );
}
