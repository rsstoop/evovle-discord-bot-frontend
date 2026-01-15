"use client";

import { Sidebar } from "@/components/sidebar";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function ContentViewer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileName = searchParams.get('file');
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fileName) {
      fetchContent();
    } else {
      setError('No file specified');
      setIsLoading(false);
    }
  }, [fileName]);

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/content-explorer/view?file=${encodeURIComponent(fileName!)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || errorData.message || 'Failed to fetch file content';
        throw new Error(errorMessage);
      }

      const { content } = await response.json();
      setHtmlContent(content);
    } catch (err: any) {
      console.error("Failed to fetch content:", err);
      setError(err.message || "Failed to load file content");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-56 h-screen overflow-hidden" style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading content...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <p className="text-sm font-medium text-destructive mb-1">Error loading content</p>
            <p className="text-xs text-muted-foreground text-center max-w-md">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchContent}
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        ) : htmlContent ? (
          <iframe
            srcDoc={htmlContent}
            className="w-full h-full border-0"
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none',
              display: 'block'
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            title={fileName || 'Content viewer'}
          />
        ) : null}
      </main>
    </div>
  );
}

export default function ContentExplorerViewPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 lg:pl-56 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    }>
      <ContentViewer />
    </Suspense>
  );
}

