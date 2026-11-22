import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import StudentGradingTimeline from "~/components/v2/features/students/StudentGradingTimeline";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { getPrimaryStudentUid } from "~/models/student";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading.server";
import { getTagCountsByStudent } from "~/models/student-grading-tag.server";
import type { StudentDetailPageContext } from "./students.$id";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const studentUid = params.id;
  if (!studentUid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const { env, ctx } = context.cloudflare;
  const [currentUser, gradingStudentUid] = await Promise.all([
    getActiveSensei(env, request),
    getPrimaryStudentUid(env, studentUid).catch((error: unknown) => {
      getLogger(env, ctx, { route: "students.$id.gradings.loader", studentUid }).error(
        "Failed to resolve the primary student for gradings",
        error,
      );
      if (isStudentNotFoundError(error)) {
        throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
      }
      throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
    }),
  ]);
  if (!gradingStudentUid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const [tagCounts, allGradings] = await Promise.all([
    getTagCountsByStudent(env, gradingStudentUid),
    getStudentGradingsByStudentWithUsers(env, gradingStudentUid, true, currentUser?.id),
  ]);
  const sortedGradings = [...allGradings].sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return { tagCounts, allGradings: sortedGradings, currentUser };
};

export default function StudentGradingsPage() {
  const { student } = useOutletContext<StudentDetailPageContext>();
  const { tagCounts, allGradings, currentUser } = useLoaderData<typeof loader>();
  const gradingsWithStudent = allGradings.map((grading) => ({
    ...grading,
    student: { uid: student.uid, name: student.name },
  }));
  const currentUserReview = gradingsWithStudent.find(
    (grading) => currentUser && grading.user.username === currentUser.username,
  );

  return (
    <section className="flex flex-col gap-2 md:gap-3">
      <StudentGradingChart
        student={student}
        tagCounts={tagCounts}
        noGrading={gradingsWithStudent.length === 0}
        signedIn={currentUser !== null}
        currentUserReview={currentUserReview}
        showRecentReview={false}
      />
      <StudentGradingTimeline gradings={gradingsWithStudent} currentUser={currentUser} />
    </section>
  );
}
