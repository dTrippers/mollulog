export function isAdminSensei<T extends { role: string }>(sensei: T | null): sensei is T & { role: "admin" } {
  return sensei?.role === "admin";
}
