"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Search, Plus, Trash2, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";

interface KnowledgeBaseItem {
  id: number;
  doc_id: string;
  source_filename: string;
  title: string;
  html: string;
  parent: string | null;
  created_at?: string;
  updated_at?: string;
}

function KnowledgeBaseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<KnowledgeBaseItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<KnowledgeBaseItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublicDomain, setIsPublicDomain] = useState<boolean | null>(null); // null = not determined yet
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0); // reset file input after use
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parentInput, setParentInput] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoParent, setVideoParent] = useState("");
  const [showPublicNav, setShowPublicNav] = useState(false);
  
  // Check if we're on the public docs domain - set on mount to prevent flash
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isPublic = window.location.hostname === 'docs-evolve.stoopdynamics.com' ||
        window.location.hostname.includes('docs-evolve.stoopdynamics.com');
      setIsPublicDomain(isPublic);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeBase();
  }, []);

  useEffect(() => {
    if (items.length > 0 && !isLoading) {
      // Check if there's a doc_id in the URL
      const docId = searchParams.get('id');
      if (docId) {
        const item = items.find(i => String(i.doc_id) === String(docId));
        if (item) {
          setSelectedItem((prev) => {
            // Only update if different to avoid unnecessary renders
            return prev?.id === item.id ? prev : item;
          });
          return;
        }
      }
      // If no URL param or doc_id not found, default to first item
      // Only set if selectedItem is not already set or doesn't match
      setSelectedItem((prev) => {
        if (!prev || (docId && String(prev.doc_id) !== String(docId))) {
          return items[0];
        }
        return prev;
      });
    }
  }, [items, searchParams, isLoading]);

  const fetchKnowledgeBase = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("dashboard_knowledge_base")
        .select("id, doc_id, source_filename, title, html, parent, created_at, updated_at")
        .order("parent", { ascending: true })
        .order("title", { ascending: true });

      if (error) {
        console.error("Error fetching knowledge base:", error);
      } else {
        setItems(data || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getNextDocId = (): number => {
    const existing = items
      .map((i) => (typeof i.doc_id === "string" ? parseInt(i.doc_id as unknown as string, 10) : (i.doc_id as unknown as number)))
      .filter((n) => Number.isFinite(n));
    if (existing.length === 0) return 1;
    return Math.max(...existing) + 1;
  };

  const extractTitleFromHtml = (html: string, fallback: string): string => {
    const match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (match && match[1]) return match[1].trim();
    // Fallback: filename without extension, title-cased
    const base = fallback.replace(/\.[^.]+$/, "");
    return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const handleFileSelected = async (file: File) => {
    if (!file) return;
    const isHtml = file.type === "text/html" || file.name.toLowerCase().endsWith(".html");
    if (!isHtml) {
      alert("Please select an .html file.");
      return;
    }
    setPendingFile(file);
    setParentInput("");
    setShowUploadDialog(true);
  };

  const performUpload = async () => {
    if (!pendingFile) return;
    try {
      setIsSubmitting(true);
      const text = await pendingFile.text();
      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_filename: pendingFile.name,
          html: text,
          parent: parentInput.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(body);
        alert(body?.error || 'Failed to upload HTML to knowledge base.');
        return;
      }
      await fetchKnowledgeBase();
      setShowUploadDialog(false);
      setPendingFile(null);
      setParentInput("");
      setFileInputKey((k) => k + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number | string) => {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/knowledge-base/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(body);
        alert(body?.error || 'Failed to delete document.');
        return;
      }
      await fetchKnowledgeBase();
      // If we deleted the selected one, clear selection
      setSelectedItem((prev) => (prev && String(prev.id) === String(id) ? null : prev));
    } finally {
      setDeletingId(null);
    }
  };

  const getTitleFromHtml = (html: string): string => {
    const match = html.match(/<h1>(.*?)<\/h1>/);
    return match ? match[1] : "Untitled";
  };

  const filteredItems = items.filter((item) => {
    const articleTitle = getTitleFromHtml(item.html).toLowerCase();
    return articleTitle.includes(searchQuery.toLowerCase());
  });

  // Group items by parent
  const parentDisplayMap: Record<string, string> = {};
  const groupedByParent = filteredItems.reduce((acc, item) => {
    const raw = (item.parent || 'Other').trim();
    const key = raw.toLowerCase();
    if (!parentDisplayMap[key]) parentDisplayMap[key] = raw;
    if (!acc[key]) {
      acc[key] = [] as KnowledgeBaseItem[];
    }
    (acc[key] as KnowledgeBaseItem[]).push(item);
    return acc;
  }, {} as Record<string, KnowledgeBaseItem[]>);

  // Get the most recent date for each parent (for sorting)
  const parentDates: Record<string, Date> = {};
  Object.keys(groupedByParent).forEach((parentKey) => {
    const items = groupedByParent[parentKey];
    const dates = items
      .map(item => item.created_at || item.updated_at)
      .filter(Boolean)
      .map(date => new Date(date!));
    
    // Use the most recent date for the parent
    parentDates[parentKey] = dates.length > 0 
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : new Date(0);
  });

  // Sort parents by most recent date (oldest first)
  const sortedParents = Object.keys(groupedByParent).sort((a, b) => {
    return parentDates[a].getTime() - parentDates[b].getTime();
  });

  // Don't render until domain is determined to prevent flash
  if (isPublicDomain === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {!isPublicDomain && <Sidebar />}
      <main className={`flex-1 ${!isPublicDomain ? 'lg:pl-56' : ''} flex`}>
        {/* Main Content Area */}
        <div className={cn(
          "flex-1 overflow-auto overscroll-none",
          isPublicDomain ? "p-6 pb-16 lg:p-8" : "p-4 lg:p-8"
        )}>
          {isLoading ? (
            <div className="max-w-4xl mx-auto text-center py-12">
              <p className="text-muted-foreground">Loading knowledge base...</p>
            </div>
          ) : selectedItem ? (
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between gap-2 mb-6">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h1 className="text-base font-normal">Knowledge Base</h1>
                </div>
                {!isPublicDomain && (
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    className="inline-flex items-center text-xs px-2 py-1 rounded border border-border hover:bg-muted/20"
                    disabled={deletingId === selectedItem.id}
                    title="Delete this document"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </button>
                )}
              </div>
              
              <div className="prose prose-invert max-w-none">
                <article
                  dangerouslySetInnerHTML={{ __html: selectedItem.html }}
                />
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery ? "No presentations found matching your search." : "No presentations available."}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar with title list */}
        {isPublicDomain ? (
          <>
            {/* Public mobile floating burger */}
            <button
              className="sm:hidden fixed top-3 right-3 z-50 inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background/90 backdrop-blur shadow"
              aria-label={showPublicNav ? 'Close docs menu' : 'Open docs menu'}
              onClick={() => setShowPublicNav((v) => !v)}
            >
              {showPublicNav ? (
                <X className="h-4 w-4" />
              ) : (
                <Menu className="h-4 w-4" />
              )}
            </button>

            {/* Overlay for mobile nav */}
            {showPublicNav && (
              <div
                className="sm:hidden fixed inset-0 z-40 bg-black/60"
                onClick={() => setShowPublicNav(false)}
              />
            )}

            <div className={cn(
              "bg-background",
              "sm:block sm:w-80",
              showPublicNav ? "fixed z-50 inset-y-0 right-0 w-72 sm:static sm:z-auto" : "hidden sm:block"
            )}>
              <div className={cn("flex flex-col", "sm:h-screen", showPublicNav ? "h-full" : "")}>            
              {/* Header - only on public domain */}
              {isPublicDomain && (
                <div className="p-4 border-b border-border">
                  <div className="flex flex-col items-center gap-3">
                    <img
                      src="/evolve_logo.png"
                      alt="Evolve Logo"
                      className="object-contain w-full h-auto px-2"
                    />
                    <a
                      href="https://stoopdynamics.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      By StoopDynamics.com
                    </a>
                  </div>
                </div>
              )}
              {/* Search */}
              <div className="p-4">
                {!isPublicDomain && (
                  <div className="flex flex-col items-stretch mb-3 gap-2">
                    <div className="text-xs text-muted-foreground">Manage</div>
                    {/* Manage buttons rendered only in dashboard; omitted on public */}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Title List */}
              <ScrollArea className="flex-1">
                <div className="px-2 py-4">
                  {filteredItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      No results found
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sortedParents.map((parentKey) => (
                        <div key={parentKey}>
                          {/* Parent Header */}
                          <div className="px-3 pt-4 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
                            {parentDisplayMap[parentKey]}
                          </div>
                          {/* Articles in this parent group */}
                          <div className="space-y-1">
                            {groupedByParent[parentKey].map((item) => {
                              const title = getTitleFromHtml(item.html);
                              const isSelected = selectedItem?.id === item.id;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => {
                                    setSelectedItem(item);
                                    if (isPublicDomain) {
                                      router.push(`/?id=${item.doc_id}`, { scroll: false });
                                    } else {
                                      router.push(`/knowledge-base?id=${item.doc_id}`, { scroll: false });
                                    }
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-2 text-xs transition-colors",
                                    "text-muted-foreground hover:text-foreground",
                                    isSelected && "text-foreground"
                                  )}
                                >
                                  <div className="line-clamp-2">{title}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <div className="hidden lg:block w-80 bg-background">
          <div className="sticky top-0 flex flex-col h-screen">
            {/* Header - only on public domain */}
            {isPublicDomain && (
              <div className="p-4 border-b border-border">
                <div className="flex flex-col items-center gap-3">
                  <img
                    src="/evolve_logo.png"
                    alt="Evolve Logo"
                    className="object-contain w-full h-auto px-2"
                  />
                </div>
              </div>
            )}
            {/* Search */}
            <div className="p-4">
              {!isPublicDomain && (
                <div className="flex flex-col items-stretch mb-3 gap-2">
                  <div className="text-xs text-muted-foreground">Manage</div>
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      key={fileInputKey}
                      type="file"
                      accept=".html,text/html"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                      }}
                      disabled={isSubmitting}
                    />
                    <span className="inline-flex items-center px-2 py-1 rounded border border-border hover:bg-muted/20">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {isSubmitting ? "Uploading..." : "Add HTML doc"}
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="file"
                      accept="audio/mpeg,.mp3"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        // Basic client-side size guard for large MP3s (200MB)
                        if (f.size > 200 * 1024 * 1024) {
                          alert('This MP3 is larger than 200MB and may fail to upload. Please try a smaller file.');
                          return;
                        }
                        setPendingVideo(f);
                        setVideoTitle("");
                        setVideoParent("");
                        setShowVideoDialog(true);
                      }}
                      disabled={isSubmitting}
                    />
                    <span className="inline-flex items-center px-2 py-1 rounded border border-border hover:bg-muted/20">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {isSubmitting ? "Processing..." : "Transcribe MP3 to HTML doc"}
                    </span>
                  </label>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Title List */}
            <ScrollArea className="flex-1">
              <div className="px-2 py-4">
                {filteredItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No results found
                  </div>
                ) : (
                  <div className="space-y-4">
                     {sortedParents.map((parentKey) => (
                       <div key={parentKey}>
                        {/* Parent Header */}
                        <div className="px-3 pt-4 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
                           {parentDisplayMap[parentKey]}
                        </div>
                        {/* Articles in this parent group */}
                        <div className="space-y-1">
                           {groupedByParent[parentKey].map((item) => {
                            const title = getTitleFromHtml(item.html);
                            const isSelected = selectedItem?.id === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setSelectedItem(item);
                                  if (isPublicDomain) {
                                    router.push(`/?id=${item.doc_id}`, { scroll: false });
                                  } else {
                                    router.push(`/knowledge-base?id=${item.doc_id}`, { scroll: false });
                                  }
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-xs transition-colors",
                                  "text-muted-foreground hover:text-foreground",
                                  isSelected && "text-foreground"
                                )}
                              >
                                <div className="line-clamp-2">{title}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          </div>
        )}
      </main>

      {showUploadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setShowUploadDialog(false);
              setPendingFile(null);
              setParentInput("");
              setFileInputKey((k) => k + 1);
            }}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-md mx-4 p-4">
            <h2 className="text-sm font-medium">Upload HTML doc</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Reminder: include an <code>&lt;h1&gt;</code> in your HTML to set the document title.
            </p>
            <div className="mt-4">
              <label className="text-xs text-muted-foreground block mb-1">Category (parent, optional)</label>
              <Input
                placeholder="e.g. Onboarding"
                value={parentInput}
                onChange={(e) => setParentInput(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground/70">This only groups docs in the docs navbar.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowUploadDialog(false);
                  setPendingFile(null);
                  setParentInput("");
                  setFileInputKey((k) => k + 1);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={performUpload}
                disabled={isSubmitting || !pendingFile}
              >
                {isSubmitting ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowDeleteDialog(false)}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-md mx-4 p-4">
            <h2 className="text-sm font-medium">Delete document</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deletingId === selectedItem.id}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await handleDelete(selectedItem.id);
                  setShowDeleteDialog(false);
                }}
                disabled={deletingId === selectedItem.id}
              >
                {deletingId === selectedItem.id ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showVideoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setShowVideoDialog(false);
              setPendingVideo(null);
              setVideoTitle("");
              setVideoParent("");
            }}
          />
          <div className="relative bg-background border border-border rounded-md shadow-lg w-full max-w-md mx-4 p-4">
            <h2 className="text-sm font-medium">Transcribe video to HTML doc</h2>
            <p className="text-xs text-muted-foreground mt-1">
              The generated HTML will include your title as an <code>&lt;h1&gt;</code> and paragraphs based on the transcription. The max File size is 25MB.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Category (parent, optional)</label>
                <Input
                  placeholder="e.g. Onboarding"
                  value={videoParent}
                  onChange={(e) => setVideoParent(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">This only groups docs in the docs navbar.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowVideoDialog(false);
                  setPendingVideo(null);
                  setVideoTitle("");
                  setVideoParent("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!pendingVideo) return;
                  try {
                    setIsSubmitting(true);
                    // 1) Upload MP3 directly to Supabase Storage via signed URL
                    const signRes = await fetch('/api/storage/signed-upload', { method: 'POST' });
                    if (!signRes.ok) {
                      const body = await signRes.json().catch(() => ({}));
                      console.error(body);
                      alert(body?.error || 'Failed to prepare upload.');
                      return;
                    }
                    const { bucket, path, token } = await signRes.json();
                    const up = await (supabase as any).storage.from(bucket).uploadToSignedUrl(path, token, pendingVideo);
                    if (up?.error) {
                      console.error(up.error);
                      alert('Failed to upload MP3.');
                      return;
                    }
                    // 2) Ask server to transcribe from storage (small JSON payload)
                    const tres = await fetch('/api/transcribe-from-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket, path }) });
                    if (!tres.ok) {
                      const body = await tres.json().catch(() => ({}));
                      console.error(body);
                      alert(body?.error || 'Failed to transcribe MP3 from storage.');
                      return;
                    }
                    const { text } = await tres.json();
                    // 2) Generate structured HTML from transcript using OpenAI
                    const htmlRes = await fetch('/api/generate-html-from-transcript', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ transcript: text }),
                    });
                    if (!htmlRes.ok) {
                      const body = await htmlRes.json().catch(() => ({}));
                      console.error(body);
                      alert(body?.error || 'Failed to generate HTML from transcript.');
                      return;
                    }
                    const { html } = await htmlRes.json();
                    // 3) Store via HTML upload endpoint (server will summarize from HTML)
                    const ures = await fetch('/api/knowledge-base/upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        source_filename: pendingVideo.name,
                        html,
                        parent: videoParent,
                        transcript: text,
                      }),
                    });
                    if (!ures.ok) {
                      const body = await ures.json().catch(() => ({}));
                      console.error(body);
                      alert(body?.error || 'Failed to save document.');
                      return;
                    }
                    // Close dialog and schedule refresh
                    setShowVideoDialog(false);
                    setPendingVideo(null);
                    setVideoTitle("");
                    setVideoParent("");
                    await fetchKnowledgeBase();
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting || !pendingVideo}
              >
                {isSubmitting ? 'Processing...' : 'Create doc'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <KnowledgeBaseContent />
    </Suspense>
  );
}
