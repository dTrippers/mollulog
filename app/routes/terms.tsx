import { type MetaFunction, useLoaderData } from "react-router";
import LegalDocument from "~/components/features/legal/LegalDocument";
import terms from "~/content/legal/terms.md?raw";
import { renderMarkdownToSafeHtml } from "~/lib/markdown.server";
import { socialMeta } from "~/lib/seo";

export const loader = () => ({ html: renderMarkdownToSafeHtml(terms) });

export const meta: MetaFunction = ({ location }) => {
  const title = "서비스 이용 약관";
  const description = "몰루로그 서비스 이용 약관입니다.";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
  ];
};

export default function Terms() {
  const { html } = useLoaderData<typeof loader>();
  return <LegalDocument html={html} />;
}
