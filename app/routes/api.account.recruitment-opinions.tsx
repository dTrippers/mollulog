import type { ActionFunctionArgs } from "react-router";
import { getActiveSensei, getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { updateSensei } from "~/models/sensei";

type RecruitmentOpinionSettingResponse = { ok: true; hideRecruitmentOpinions: boolean } | { ok: false; error: string };

export async function action({ request, context }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return Response.json({ ok: false, error: "로그인이 필요해요." } satisfies RecruitmentOpinionSettingResponse, {
      status: 401,
    });
  }

  let submitted: unknown;
  try {
    submitted = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청이에요." } satisfies RecruitmentOpinionSettingResponse, {
      status: 400,
    });
  }

  const value =
    submitted && typeof submitted === "object" && "hideRecruitmentOpinions" in submitted
      ? (submitted as { hideRecruitmentOpinions?: unknown }).hideRecruitmentOpinions
      : undefined;
  if (typeof value !== "boolean") {
    return Response.json(
      { ok: false, error: "설정 값이 올바르지 않아요." } satisfies RecruitmentOpinionSettingResponse,
      {
        status: 400,
      },
    );
  }

  try {
    const result = await updateSensei(env, sensei.id, { hideRecruitmentOpinions: value }, { ctx });
    if (result.error) {
      return Response.json(
        { ok: false, error: "설정을 저장하지 못했어요." } satisfies RecruitmentOpinionSettingResponse,
        { status: 500 },
      );
    }
    const authenticator = getAuthenticator(env, ctx);
    const session = await sessionStorage(env).getSession(request.headers.get("cookie"));
    session.set(authenticator.sessionKey, { ...sensei, hideRecruitmentOpinions: value });
    return Response.json({ ok: true, hideRecruitmentOpinions: value } satisfies RecruitmentOpinionSettingResponse, {
      headers: { "Set-Cookie": await sessionStorage(env).commitSession(session) },
    });
  } catch {
    return Response.json(
      { ok: false, error: "설정을 저장하지 못했어요." } satisfies RecruitmentOpinionSettingResponse,
      { status: 500 },
    );
  }
}
