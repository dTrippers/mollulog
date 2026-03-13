import { Link } from "react-router";
import { useState } from "react";
import { Button, Label } from "~/components/atoms/form";
import { SubTitle } from "~/components/atoms/typography";
import { AddContentButton, PartyUnitEditor } from "~/components/molecules/editor";
import { StudentCards } from "~/components/students";
import type { RaidType, Role, Terrain } from "~/models/content.d";
import type { Party } from "~/models/party";
import { ContentSelectForm, InputForm, TextareaForm } from "~/components/molecules/form";
import { FormGroup } from "~/components/organisms/form";
import { raidTypeLocale } from "~/locales/ko";

type PartyGeneratorProps = {
  party?: Party;
  raids: {
    uid: string;
    name: string;
    type: RaidType;
    boss: string;
    terrain: Terrain;
    since: Date;
    until: Date;
  }[];
  students: {
    uid: string;
    name: string;
    tier: number;
    role: Role;
  }[];
};

export default function PartyGenerator({ party, raids, students }: PartyGeneratorProps) {
  const studentsMap = new Map(students.map((student) => [student.uid, student]));

  const [raidUid, setRaidUid] = useState<string | undefined>(party?.raidId ?? undefined);

  const [showPartyEditor, setShowPartyEditor] = useState(false);
  const [units, setUnits] = useState<(string | null)[][]>(party?.studentIds ?? []);

  return (
    <div className="my-8">
      <SubTitle text="공략 작성하기" />
      <FormGroup>
        <InputForm name="name" label="공략 이름" placeholder="예) 비나 인세인 고점팟" defaultValue={party?.name} />
        <ContentSelectForm
          label="공략 컨텐츠"
          description="공략 대상 컨텐츠를 선택하세요"
          name="raidId"
          contents={raids.map((raid) => ({
            ...raid,
            name: `${raid.name} (${raidTypeLocale[raid.type]})`,
          }))}
          initialValue={raidUid}
          onSelect={(raidUid) => setRaidUid(raidUid)}
          searchPlaceholder="컨텐츠 이름으로 찾기..."
        />
        <TextareaForm
          label="공략 설명"
          description="공략에 대한 설명을 적어주세요"
          name="memo"
          defaultValue={party?.memo ?? undefined}
          placeholder={"8코 : 정후카 히마리 ..."}
        />
      </FormGroup>

      <SubTitle text="편성" />
      <input type="hidden" name="studentIds" value={JSON.stringify(units)} />
      {units.map((unit, index) => (
        <div className="my-4 px-4 py-2 md:px-6 md:py-4 bg-neutral-100 dark:bg-neutral-900 rounded-xl" key={unit.map((uid, unitIndex) => uid ?? `empty-${unitIndex}`).join(":")}>
          <Label text={`${index + 1}번째 파티`} />
          <StudentCards
            students={unit.map((uid) => {
              const student = uid ? studentsMap.get(uid) : null;
              return {
                uid: student?.uid ?? null,
                name: student?.name ?? undefined,
                tier: student?.tier ?? undefined,
              };
            })}
            mobileGrid={6}
            pcGrid={10}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="py-2 px-4 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-red-500 font-bold transition rounded-lg"
              onClick={() => setUnits((prev) => prev.filter((_, i) => i !== index))}
            >
              삭제
            </button>
          </div>
        </div>
      ))}
      {showPartyEditor ?
        <PartyUnitEditor
          index={units.length}
          students={students}
          onComplete={(studentUids) => {
            setUnits((prev) => [...prev, studentUids]);
            setShowPartyEditor(false);
          }}
          onCancel={() => setShowPartyEditor(false)}
        /> :
        <AddContentButton text="파티 추가하기" onClick={() => setShowPartyEditor(true)} />
      }

      <div className="flex gap-x-1">
        <Button type="submit" text="저장" color="primary" />
        <Button type="button" text="초기화" color="red" onClick={() => setUnits([])} />
        <Link to="/my?path=parties">
          <Button type="button" text="취소" />
        </Link>
      </div>
    </div>
  );
}
