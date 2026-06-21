import { useOutletContext } from "react-router";
import { StudentGradingTimeline } from "~/components/features/students";
import type { StudentDetailPageContext } from "./students.$id";
import StudentGradingChart from "./students.$id._components/StudentGradingChart";

export default function StudentGradingsPage() {
  const { student, tagCounts, allGradings, currentUser } = useOutletContext<StudentDetailPageContext>();
  const currentUserReview = allGradings.find(
    (grading) => currentUser && grading.user.username === currentUser.username,
  );

  return (
    <section className="my-4 space-y-4">
      <StudentGradingChart
        student={student}
        tagCounts={tagCounts}
        noGrading={allGradings.length === 0}
        signedIn={currentUser !== null}
        currentUserReview={currentUserReview}
        showRecentReview={false}
      />
      <StudentGradingTimeline gradings={allGradings} currentUser={currentUser} />
    </section>
  );
}
