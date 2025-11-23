import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { StudentCards } from "~/components/molecules/student";
import { getAllStudents } from "~/models/student";
import { Page } from "~/components/navigation";
import { applyStudentFilter, StudentFilter, StudentFilterState } from "~/components/students";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const students = await getAllStudents(env, true);
  return {
    students: students.sort((a, b) => a.order - b.order),
  };
};

export const meta: MetaFunction = () => {
  const title = "학생부 | 몰루로그";
  const description = "블루 아카이브 학생들의 프로필과 통계 정보를 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export default function Students() {
  const { students } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [filterState, setFilterState] = useState<StudentFilterState>({
    attackTypes: [],
    defenseTypes: [],
    roles: [],
    sort: "recent",
  });
  const filteredStudents = useMemo(() => {
    return applyStudentFilter(students, filterState);
  }, [students, filterState]);

  return (
    <Page
      title="학생부"
      description="학생들의 프로필과 총력전/대결전 통계, 평가 정보를 확인해보세요"
      panels={[
        {
          title: "필터 및 정렬",
          Icon: FunnelIcon,
          children: (
            <StudentFilter
              state={filterState} onStateChange={setFilterState}
              sortBy={["recent", "old", "name"]}
              useFilter useSearch
            />
          ),
        }
      ]}
    >
      <StudentCards
        students={filteredStudents}
        onSelect={(uid) => navigate(`/students/${uid}`)}
      />
    </Page>
  );
}
