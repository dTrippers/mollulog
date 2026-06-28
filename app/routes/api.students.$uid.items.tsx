import type { LoaderFunctionArgs } from "react-router";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { getStudentFavoriteItems } from "~/models/resource";

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보가 누락되었어요" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let student: Awaited<ReturnType<typeof getStudentFavoriteItems>>;
  try {
    student = await getStudentFavoriteItems(context.cloudflare.env, uid);
  } catch (error) {
    if (isStudentNotFoundError(error)) {
      throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 불러오지 못했어요" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!student) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return student;
};
