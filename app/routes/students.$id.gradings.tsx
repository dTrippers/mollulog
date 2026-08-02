import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { StudentGradingTimeline } from "~/components/features/students";
import { routeError } from "~/lib/http-errors";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading.server";
import { getTagCountsByStudent } from "~/models/student-grading-tag.server";
import type { StudentDetailPageContext } from "./students.$id";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const studentUid = params.id;
  if (!studentUid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  const [tagCounts, allGradings] = await Promise.all([
    getTagCountsByStudent(env, studentUid),
    getStudentGradingsByStudentWithUsers(env, studentUid, true, currentUser?.id),
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
    <section className="my-4 space-y-4">
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
