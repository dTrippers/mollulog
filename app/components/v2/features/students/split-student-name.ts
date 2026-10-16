import { parseVisibleNames } from "~/models/student";

// The main and sub names come from parseVisibleNames, the one place that knows the 1.x naming rules (for example
// "시로코*테러" reads as 시로코 with 테러). Futures does not split a student name on its own.
export function splitVisibleStudentName(name: string): { name: string; variant: string | null } {
  const [main = "", sub = null] = parseVisibleNames(name);
  return { name: main, variant: sub };
}
