import { type MetaFunction, useLoaderData } from "react-router";
import LegalDocument from "~/components/features/legal/LegalDocument";
import privacy from "~/content/legal/privacy.md?raw";
import { renderMarkdownToSafeHtml } from "~/lib/markdown.server";
import { socialMeta } from "~/lib/seo";

export const loader = () => ({ html: renderMarkdownToSafeHtml(privacy) });

export const meta: MetaFunction = ({ location }) => {
  const title = "개인정보처리방침";
  const description = "몰루로그 개인정보처리방침입니다.";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
  ];
};

export default function Privacy() {
  const { html } = useLoaderData<typeof loader>();
  return <LegalDocument html={html} />;
}
