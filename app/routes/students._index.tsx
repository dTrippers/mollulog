import { useNavigate, useOutletContext } from "react-router";
import { StudentCards } from "~/components/features/students";
import type { StudentsPageContext } from "./students";

export default function Students() {
  const { students } = useOutletContext<StudentsPageContext>();
  const navigate = useNavigate();

  return (
    <StudentCards
      students={students}
      layout="responsive-wrap"
      cardSize="lg"
      onSelect={(uid) => navigate(`/students/${uid}`)}
    />
  );
}
