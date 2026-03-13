import { Link } from "react-router";
import { PlusCircleIcon, PencilSquareIcon } from "@heroicons/react/16/solid";
import ProfileImage from "~/components/atoms/student/ProfileImage";
import TagIcon from "~/components/atoms/student/TagIcon";
import { STUDENT_GRADING_TAG_CONSTANTS, type StudentGradingTagValue } from "~/models/student-grading-tag";

// Reusable CommentCard component
type CommentCardProps = {
  grading: {
    uid: string;
    studentUid: string;
    comment: string | null;
    tags?: StudentGradingTagValue[];
    user?: { username: string; profileStudentId: string | null };
    student?: { uid: string; name: string };
  };
  isCurrentUser: boolean;
};

function CommentCard({ grading, isCurrentUser }: CommentCardProps) {
  const cardClasses = "flex-shrink-0 w-64 p-3 bg-neutral-100 dark:bg-neutral-900 rounded-lg";

  return (
    <div key={grading.uid} className={cardClasses}>
      <div className="space-y-2">
        {/* User Info */}
        {isCurrentUser && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300">내가 작성한 평가</p>
            <Link 
              to={`/students/${grading.studentUid}/grade`}
              className="px-2 py-1 -mr-2 flex items-center rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-neutral-500 dark:text-neutral-400"
            >
              <PencilSquareIcon className="size-4 mr-0.5" />
              <span className="text-sm">수정</span>
            </Link>
          </div>
        )}
        {grading.user && !isCurrentUser && (
          <Link to={`/@${grading.user.username}`} className="py-1 flex items-center gap-2 group">
            <ProfileImage studentUid={grading.user.profileStudentId} imageSize={6} />
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 group-hover:underline">
              {grading.user.username}
            </span>
          </Link>
        )}
        {grading.student && (
          <Link to={`/students/${grading.student.uid}`} className="py-1 flex items-center gap-2 group">
            <ProfileImage studentUid={grading.student.uid} imageSize={6} />
            <span className="font-bold group-hover:underline">
              {grading.student.name}
            </span>
          </Link>
        )}

        {/* Tags */}
        {grading.tags && grading.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {grading.tags
              .sort((a, b) => {
                // Sort tags according to the declaration order
                const order = Object.values(STUDENT_GRADING_TAG_CONSTANTS);
                return order.indexOf(a) - order.indexOf(b);
              })
              .map((tag) => (
                <div key={tag} className="p-1 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <TagIcon tag={tag} size="sm" />
                </div>
              ))}
          </div>
        )}

        {/* Comment */}
        <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {grading.comment}
        </p>
      </div>
    </div>
  );
}

// StudentGradingComments component for displaying comments horizontally
type StudentGradingCommentsProps = {
  gradings: CommentCardProps["grading"][];
  student?: { uid: string; name: string };
  currentUser?: { username: string } | null;
};

export default function StudentGradingComments({ student, gradings, currentUser }: StudentGradingCommentsProps) {
  const currentUserGrading = gradings.find((grading) => currentUser && grading.user?.username === currentUser.username);
  const otherComments = gradings.filter((grading) => grading.uid !== currentUserGrading?.uid);

  // If no comments at all, don't show anything
  if (gradings.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-2" style={{ width: 'max-content' }}>
          {/* Current user's comment or link button */}
           {currentUserGrading ?
             <CommentCard grading={currentUserGrading} isCurrentUser={true} /> :
             currentUser && student ?
                <Link
                  to={`/students/${student.uid}/grade`}
                  className="flex h-full w-32 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-neutral-100 p-3 text-center text-neutral-500 transition hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                >
                  <PlusCircleIcon className="mb-2 size-6" />
                  <p className="text-sm">내 평가 작성하기</p>
                </Link>
             : null
           }

          {/* Other users' comments */}
          {otherComments.map((grading) => (
            <CommentCard key={grading.uid} grading={grading} isCurrentUser={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
