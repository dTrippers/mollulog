import { ButtonForm, FormGroup, InputForm, StudentSelectForm, TextareaForm } from "~/components/features/forms";

type ProfileStudent = {
  uid: string;
  name: string;
  order: number;
};

type Profile = {
  username: string;
  profileStudentId: string | null;
  friendCode: string | null;
  bio: string | null;
};

type ProfileEditorProps = {
  method: "put" | "post";
  students: ProfileStudent[];
  initialData?: Profile;
  error?: {
    username?: string;
    friendCode?: string;
    bio?: string;
  };
  submitOnChange?: boolean;
};

export default function ProfileEditor({ method, students, initialData, error, submitOnChange }: ProfileEditorProps) {
  const initialProfileStudentId = initialData?.profileStudentId ? students.find(({ uid }) => initialData.profileStudentId === uid)?.uid : undefined;
  return (
    <FormGroup method={method} submitOnChange={submitOnChange}>
      <InputForm
        label="닉네임 (필수)" type="text" name="username"
        defaultValue={initialData?.username}
        description="4~20글자의 영숫자 및 _ 기호"
        placeholder="닉네임 입력 (필수)"
        error={error?.username}
      />
      <StudentSelectForm
        label="프로필 학생" name="profileStudentId"
        description="학생을 프로필 이미지로 설정할 수 있어요"
        students={students}
        initialStudentUids={initialProfileStudentId ? [initialProfileStudentId] : undefined}
        placeholder="프로필 학생 선택"
      />
      <InputForm
        label="친구 코드" type="text" name="friendCode"
        description="8자리 영문자"
        defaultValue={initialData?.friendCode ?? undefined}
        placeholder="[소셜] > [친구] > [ID 카드] 에서 확인"
        error={error?.friendCode}
      />
      <TextareaForm
        label="자기소개" name="bio"
        description="100글자까지 작성할 수 있어요"
        defaultValue={initialData?.bio ?? undefined}
        error={error?.bio}
        placeholder="자기소개 입력"
      />
      {!submitOnChange && <ButtonForm type="submit" label="선생님 등록하기" color="blue" />}
    </FormGroup>
  );
}
