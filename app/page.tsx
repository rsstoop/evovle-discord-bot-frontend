import { Sidebar } from "@/components/sidebar";
import { ContentIdeas } from "@/components/content-ideas";
import { headers } from "next/headers";
import dynamic from "next/dynamic";

const DOCS_DOMAIN = process.env.DOCS_DOMAIN || 'docs-evolve.stoopdynamics.com';

// Dynamically import knowledge base page only when needed
const KnowledgeBasePage = dynamic(() => import("@/app/knowledge-base/page"), {
  ssr: true,
});

export default async function Home() {
  const headersList = await headers();
  const hostname = headersList.get('host') || '';
  const isDocsDomain = hostname === DOCS_DOMAIN || hostname.includes(DOCS_DOMAIN);

  // On docs domain, render knowledge base
  if (isDocsDomain) {
    return <KnowledgeBasePage />;
  }

  // Dashboard home page - Content Ideas
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-56">
        <ContentIdeas />
      </main>
    </div>
  );
}
