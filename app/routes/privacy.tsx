import { type MetaFunction, useLoaderData } from "react-router";
import LegalDocument from "~/components/features/legal/LegalDocument";
import privacy from "~/content/legal/privacy.md?raw";
import { renderMarkdownToSafeHtml } from "~/lib/markdown.server";

export const loader = () => ({ html: renderMarkdownToSafeHtml(privacy) });

export const meta: MetaFunction = () => [
  { title: "개인정보처리방침 | 몰루로그" },
  { name: "description", content: "몰루로그 개인정보처리방침입니다." },
];

export default function Privacy() {
  const { html } = useLoaderData<typeof loader>();
  return <LegalDocument html={html} />;
}
