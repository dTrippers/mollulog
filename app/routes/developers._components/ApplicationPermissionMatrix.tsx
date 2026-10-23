import { Checkbox } from "~/components/v2/primitives/Checkbox";
import type { ApiScope } from "~/domain/mollulog-api-spec";

export function ApplicationPermissionMatrix({
  scopes,
  onChange,
  error,
}: {
  scopes: ApiScope[];
  onChange: (scopes: ApiScope[]) => void;
  error?: string;
}) {
  const profile = scopes.includes("profile");
  const read = scopes.includes("students:read");
  const write = scopes.includes("students:write");

  return (
    <fieldset className="space-y-2" aria-describedby={error ? "application-scopes-error" : undefined} aria-invalid={Boolean(error)}>
      <legend className="text-sm font-semibold">권한</legend>
      <table className="w-full max-w-md border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-v2-fg-tertiary">
            <th className="pb-2" scope="col">
              데이터
            </th>
            <th className="w-[4.5rem] pb-2 text-center" scope="col">
              읽기
            </th>
            <th className="w-[4.5rem] pb-2 text-center" scope="col">
              쓰기
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="rounded-l-md bg-v2-inset py-2.5 pl-3 text-left font-medium" scope="row">
              프로필
              <span className="block text-xs font-normal text-v2-fg-secondary">닉네임 · 프로필 학생</span>
            </th>
            <td className="bg-v2-inset py-2.5 text-center">
              <div className="flex justify-center">
                <Checkbox
                  id="application-scope-profile"
                  name="scope"
                  value="profile"
                  checked={profile}
                  onCheckedChange={(checked) => onChange(checked ? [...scopes, "profile"] : scopes.filter((scope) => scope !== "profile"))}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "application-scopes-error" : undefined}
                >
                  <span className="sr-only">프로필 보기</span>
                </Checkbox>
              </div>
            </td>
            <td className="rounded-r-md bg-v2-inset py-2.5 text-center text-v2-fg-tertiary" aria-label="쓰기 권한 없음">
              –
            </td>
          </tr>
          <tr>
            <th className="rounded-l-md bg-v2-inset py-2.5 pl-3 text-left font-medium" scope="row">
              모집 학생
              <span className="block text-xs font-normal text-v2-fg-secondary">학생 모집 여부, 성장도, 인연 랭크 등</span>
            </th>
            <td className="bg-v2-inset py-2.5 text-center">
              {write ? <input type="hidden" name="scope" value="students:read" /> : null}
              <div className="flex justify-center">
                <Checkbox
                  id="application-scope-students-read"
                  name="scope"
                  value="students:read"
                  checked={read}
                  disabled={write}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...scopes, "students:read"] : scopes.filter((scope) => scope !== "students:read") as ApiScope[])
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "application-scopes-error" : undefined}
                >
                  <span className="sr-only">모집 학생 보기</span>
                </Checkbox>
              </div>
            </td>
            <td className="rounded-r-md bg-v2-inset py-2.5 text-center">
              <div className="flex justify-center">
                <Checkbox
                  id="application-scope-students-write"
                  name="scope"
                  value="students:write"
                  checked={write}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...scopes.filter((scope) => scope !== "students:read"), "students:read", "students:write"]
                        : scopes.filter((scope) => scope !== "students:write"),
                    )
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "application-scopes-error" : undefined}
                >
                  <span className="sr-only">모집 학생 변경</span>
                </Checkbox>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {error ? (
        <p id="application-scopes-error" className="text-sm font-medium text-v2-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
