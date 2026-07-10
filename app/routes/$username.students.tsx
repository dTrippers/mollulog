import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "react-router";
import { useLoaderData, data, useFetcher, useOutletContext } from "react-router";
import { StudentCards, TierSelector } from "~/components/features/students";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, SubTitle, Toggle } from "~/components/primitives";
import { getRouteSensei } from "./$username";
import { getAllStudents } from "~/models/student";
import { getRecruitedStudents, upsertRecruitedStudent, removeRecruitedStudent } from "~/models/recruited-student";
import { MinusCircleIcon, IdentificationIcon, PlusCircleIcon, FunnelIcon } from "@heroicons/react/24/outline";
import { useEffect, useState, useMemo } from "react";
import { createStudentFilterState, getFilteredStudentUids, StudentFilter } from "~/components/features/students";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);

  const sensei = await getRouteSensei(env, params);
  const recruitedStudents = await getRecruitedStudents(env, sensei.id);
  const recruitedStudentTiers = recruitedStudents.reduce(
    (acc, { studentUid, tier }) => {
      acc[studentUid] = tier;
      return acc;
    },
    {} as Record<string, number>,
  );

  const allStudents = await getAllStudents(env);
  return {
    me: currentUser?.username === sensei.username,
    noRecruited: recruitedStudents.length === 0,
    students: allStudents.map((student) => ({
      uid: student.uid,
      name: student.name,
      attackType: student.attackType,
      defenseType: student.defenseType,
      role: student.role,
      position: student.position,
      tacticRole: student.tacticRole,
      order: student.order,
      initialTier: student.initialTier,
      tier: recruitedStudentTiers[student.uid] ?? null,
    })),
  };
};

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 학생부 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 학생부 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
  ];
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const sensei = await getRouteSensei(env, params);
  if (currentUser.username !== sensei.username) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const studentUid = formData.get("studentUid") as string;
  const tier = Number.parseInt(formData.get("tier") as string);

  if (!studentUid) {
    return data({ error: "Student UID is required" }, { status: 400 });
  }

  switch (request.method) {
    case "POST":
      await upsertRecruitedStudent(env, sensei.id, studentUid, tier);
      break;
    case "DELETE":
      await removeRecruitedStudent(env, sensei.id, studentUid);
      break;
    default:
      return data({ error: "Method not allowed" }, { status: 405 });
  }
  return data({ success: true });
};

export default function UserPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { me, noRecruited, students } = loaderData;

  const [filterState, setFilterState] = useState(() => createStudentFilterState("recent"));
  const filteredUids = useMemo(() => getFilteredStudentUids(students, filterState), [students, filterState]);
  const studentMap = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const [recruitedStudents, unrecruitedStudents] = useMemo(() => {
    const filteredStudents = filteredUids.flatMap((uid) => {
      const student = studentMap.get(uid);
      return student ? [student] : [];
    });
    return [filteredStudents.filter(({ tier }) => tier), filteredStudents.filter(({ tier }) => !tier)];
  }, [studentMap, filteredUids]);

  const { setPanel } = useOutletContext<{
    setPanel: (panel: {
      title: string;
      description: string;
      Icon: React.ElementType;
      children: React.ReactNode;
    }) => void;
  }>();
  useEffect(() => {
    setPanel({
      title: "필터 및 정렬",
      description: "학생을 필터링하고 정렬할 수 있어요.",
      Icon: FunnelIcon,
      children: (
        <StudentFilter
          students={students}
          state={filterState}
          onStateChange={setFilterState}
          useFilter
          useSearch
          sortBy={["recent", "old", "name", "tier"]}
        />
      ),
    });
  }, [filterState, students, setPanel]);

  const [batchAddMode, setBatchAddMode] = useState(false);
  const [batchAddStudentUids, setBatchAddStudentUids] = useState<string[]>([]);

  const fetcher = useFetcher();
  const handleAddStudent = (studentUid: string, tier: number) => {
    const formData = new FormData();
    formData.append("studentUid", studentUid);
    formData.append("tier", tier.toString());
    fetcher.submit(formData, { method: "post" });
  };

  const handleRemoveStudent = (studentUid: string) => {
    const formData = new FormData();
    formData.append("studentUid", studentUid);
    fetcher.submit(formData, { method: "delete" });
  };

  return (
    <>
      <div className="my-8">
        <SubTitle
          text="모집한 학생"
          description={me && !noRecruited ? "학생을 선택해 성장 등급을 수정할 수 있어요." : undefined}
        />
        {noRecruited ? (
          <div className="my-16 text-center">아직 모집한 학생이 없어요</div>
        ) : (
          <StudentCards
            students={recruitedStudents.map(({ uid, name, attackType, defenseType, role, initialTier, tier }) => ({
              uid,
              name,
              attackType,
              defenseType,
              role,
              initialTier,
              tier,
              popups: [
                ...(me
                  ? [
                      {
                        children: (
                          <TierSelector
                            initialTier={initialTier}
                            currentTier={tier}
                            onTierChange={(tier) => handleAddStudent(uid, tier)}
                          />
                        ),
                      },
                      {
                        Icon: MinusCircleIcon,
                        text: "모집한 학생에서 제외",
                        onClick: () => handleRemoveStudent(uid),
                      },
                    ]
                  : []),
                {
                  Icon: IdentificationIcon,
                  text: "학생부 보기",
                  link: `/students/${uid}`,
                },
              ],
            }))}
          />
        )}
      </div>

      <div className="my-8">
        <SubTitle text="미모집 학생" description={me ? "학생을 선택해 모집 정보를 등록할 수 있어요." : undefined} />
        {me && (
          <>
            <Toggle label="모집한 학생 일괄 등록" initialState={batchAddMode} onChange={setBatchAddMode} />
            {batchAddMode && (
              <div className="mb-2 flex gap-x-1">
                <Button
                  variant="primary"
                  onClick={() => {
                    for (const uid of batchAddStudentUids) {
                      const student = unrecruitedStudents.find((currentStudent) => currentStudent.uid === uid);
                      if (student) {
                        handleAddStudent(uid, student.initialTier);
                      }
                    }
                    setBatchAddStudentUids([]);
                    setBatchAddMode(false);
                  }}
                >
                  선택한 학생 등록
                </Button>
                {batchAddStudentUids.length > 0 ? (
                  <Button onClick={() => setBatchAddStudentUids([])}>모두 해제</Button>
                ) : (
                  <Button onClick={() => setBatchAddStudentUids(unrecruitedStudents.map((student) => student.uid))}>
                    모두 선택
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        <StudentCards
          students={unrecruitedStudents.map(({ uid, name, attackType, defenseType, role, initialTier }) => ({
            uid,
            name,
            attackType,
            defenseType,
            role,
            grayscale: true,
            checked: batchAddMode ? batchAddStudentUids.includes(uid) : undefined,
            popups: batchAddMode
              ? []
              : [
                  ...(me
                    ? [
                        {
                          Icon: PlusCircleIcon,
                          text: "모집한 학생에 추가",
                          onClick: () => handleAddStudent(uid, initialTier),
                        },
                      ]
                    : []),
                  {
                    Icon: IdentificationIcon,
                    text: "학생부 보기",
                    link: `/students/${uid}`,
                  },
                ],
          }))}
          onSelect={
            batchAddMode
              ? (uid: string) => {
                  setBatchAddStudentUids((prev) => {
                    if (prev.includes(uid)) {
                      return prev.filter((each) => each !== uid);
                    }
                    return [...prev, uid];
                  });
                }
              : undefined
          }
        />
      </div>
    </>
  );
}
