import hangul from "hangul-js";

const { search } = hangul;

export function filterStudentByName<T extends { name: string; altNames?: string[] }>(
  keyword: string,
  students: T[],
  count?: number,
): T[] {
  let currentCount = 0;
  return students.filter((student) => {
    if (currentCount >= (count ?? Number.POSITIVE_INFINITY)) {
      return false;
    }

    const matched = [student.name, ...(student.altNames ?? [])].some((name) => search(name, keyword) >= 0);
    if (matched) {
      currentCount++;
    }
    return matched;
  });
}
